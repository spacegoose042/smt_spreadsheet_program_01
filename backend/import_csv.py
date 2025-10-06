"""
Import work orders from CSV spreadsheet export
"""
import csv
from datetime import datetime, date
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import WorkOrder, SMTLine, CompletedWorkOrder, WorkOrderStatus, Priority, SideType, THKitStatus

def parse_date(date_str):
    """Parse various date formats from the spreadsheet"""
    if not date_str or date_str.strip() == '':
        return None
    
    date_str = date_str.strip()
    
    # Skip Excel serial dates (1/1/00, 1/2/00 etc)
    if date_str.startswith('1/') and date_str.endswith('/00'):
        return None
    
    # Skip placeholder dates
    if date_str == '#REF!' or date_str == '12/29/1899':
        return None
    
    try:
        # Try m/d/yy format (5/9/25 = May 9, 2025)
        parts = date_str.split('/')
        if len(parts) == 3:
            month, day, year = parts
            # Convert 2-digit year to 4-digit (25 = 2025)
            year_int = int(year)
            if year_int < 100:
                year_int = 2000 + year_int
            return date(year_int, int(month), int(day))
    except:
        pass
    
    return None


def parse_number(num_str):
    """Parse numbers with commas"""
    if not num_str or num_str.strip() == '':
        return 0
    
    # Remove commas
    cleaned = str(num_str).replace(',', '').strip()
    
    try:
        return float(cleaned)
    except:
        return 0


def map_status(status_str):
    """Map spreadsheet status to database enum"""
    if not status_str:
        return WorkOrderStatus.CLEAR_TO_BUILD
    
    status_lower = status_str.lower().strip()
    
    if 'ready' in status_lower or 'clear to build' in status_lower:
        if '*' in status_str:
            return WorkOrderStatus.CLEAR_TO_BUILD_NEW
        return WorkOrderStatus.CLEAR_TO_BUILD
    elif '2nd side' in status_lower:
        return WorkOrderStatus.SECOND_SIDE_RUNNING
    elif 'running' in status_lower:
        return WorkOrderStatus.RUNNING
    elif 'hold' in status_lower:
        return WorkOrderStatus.ON_HOLD
    elif 'program' in status_lower or 'stencil' in status_lower:
        return WorkOrderStatus.PROGRAM_STENCIL
    else:
        return WorkOrderStatus.CLEAR_TO_BUILD


def map_priority(priority_str):
    """Map spreadsheet priority to database enum"""
    if not priority_str:
        return Priority.FACTORY_DEFAULT
    
    priority_map = {
        'Critical Mass': Priority.CRITICAL_MASS,
        'Overclocked': Priority.OVERCLOCKED,
        'Factory Default': Priority.FACTORY_DEFAULT,
        'Trickle Charge': Priority.TRICKLE_CHARGE,
        'Power Down': Priority.POWER_DOWN
    }
    
    return priority_map.get(priority_str, Priority.FACTORY_DEFAULT)


def map_th_kit_status(th_kit_str):
    """Map TH KIT status to database enum"""
    if not th_kit_str or th_kit_str.strip() == '':
        return THKitStatus.NA
    
    th_kit_lower = th_kit_str.lower().strip()
    
    if 'smt only' in th_kit_lower:
        return THKitStatus.SMT_ONLY
    elif 'missing' in th_kit_lower:
        return THKitStatus.MISSING
    elif 'clear' in th_kit_lower:
        return THKitStatus.CLEAR_TO_BUILD
    elif 'n/a' in th_kit_lower or th_kit_str == 'N/A':
        return THKitStatus.NA
    else:
        return THKitStatus.NA


def get_line_id_by_name(db: Session, line_name: str):
    """Get line ID from line name"""
    if not line_name or line_name == 'Not Scheduled':
        return None
    
    # Try exact match first
    line = db.query(SMTLine).filter(SMTLine.name == line_name).first()
    if line:
        return line.id
    
    # Try partial match
    for line in db.query(SMTLine).all():
        if line_name in line.name or line.name in line_name:
            return line.id
    
    return None


def import_work_orders(csv_path: str):
    """Import work orders from CSV file"""
    db = SessionLocal()
    
    try:
        imported = 0
        skipped = 0
        completed_imported = 0
        errors = []
        
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            for row_num, row in enumerate(reader, start=2):
                try:
                    # Skip empty rows
                    if not row.get('WO') or not row.get('Customer'):
                        skipped += 1
                        continue
                    
                    # Parse dates
                    cetec_ship_date = parse_date(row.get('Cetec Ship Date'))
                    if not cetec_ship_date:
                        print(f"Row {row_num}: Skipping - no valid Cetec Ship Date")
                        skipped += 1
                        continue
                    
                    # Get line ID
                    line_id = get_line_id_by_name(db, row.get('Line'))
                    
                    # Parse line position
                    line_position = None
                    if row.get('Line Position'):
                        try:
                            line_position = int(row.get('Line Position'))
                        except:
                            pass
                    
                    # Determine if new rev/assembly (has asterisk in status)
                    is_new_rev = '*' in (row.get('Status_1') or '')
                    
                    # Parse sides
                    sides_str = row.get('Sides', '').strip()
                    sides = SideType.DOUBLE if sides_str.lower() == 'double' else SideType.SINGLE
                    
                    # Check if complete
                    is_complete = row.get('COMPLETE?', '').lower() == 'complete'
                    
                    # Create base work order data
                    wo_data = {
                        'customer': row.get('Customer', '').strip(),
                        'assembly': row.get('Assembly', '').strip(),
                        'revision': row.get('Rev', '').strip(),
                        'wo_number': row.get('WO', '').strip(),
                        'quantity': int(parse_number(row.get('Qty', 0))),
                        'status': map_status(row.get('Status_1')),
                        'priority': map_priority(row.get('Priority')),
                        'is_locked': False,  # Default to unlocked
                        'is_new_rev_assembly': is_new_rev,
                        'cetec_ship_date': cetec_ship_date,
                        'time_minutes': parse_number(row.get('Time (mins)', 0)),
                        'trolley_count': int(parse_number(row.get('Trolley', 1))),
                        'sides': sides,
                        'line_id': line_id,
                        'line_position': line_position,
                        'th_wo_number': row.get('TH WO', '').strip(),
                        'th_kit_status': map_th_kit_status(row.get('TH KIT')),
                        'run_together_group': row.get('GROUP', '').strip(),
                        'notes': row.get('NOTES', '').strip(),
                        'is_complete': False  # We'll handle completed separately
                    }
                    
                    if is_complete:
                        # Check if already exists
                        existing = db.query(CompletedWorkOrder).filter(
                            CompletedWorkOrder.wo_number == wo_data['wo_number']
                        ).first()
                        
                        if not existing:
                            # Create completed work order
                            completed_wo = CompletedWorkOrder(
                                **wo_data,
                                completion_date=datetime.now(),
                                actual_start_date=parse_date(row.get('Start Date')),
                                actual_end_date=parse_date(row.get('End Date')),
                                actual_time_clocked_minutes=parse_number(row.get('Time (mins)', 0)),
                                quantity_completed=int(parse_number(row.get('Qty', 0))),
                                estimated_quantity=int(parse_number(row.get('Qty', 0)))
                            )
                            db.add(completed_wo)
                            completed_imported += 1
                    else:
                        # Check if already exists
                        existing = db.query(WorkOrder).filter(
                            WorkOrder.wo_number == wo_data['wo_number']
                        ).first()
                        
                        if not existing:
                            # Create active work order
                            wo = WorkOrder(**wo_data)
                            db.add(wo)
                            imported += 1
                
                except Exception as e:
                    error_msg = f"Row {row_num} ({row.get('WO', 'unknown')}): {str(e)}"
                    errors.append(error_msg)
                    print(error_msg)
                    continue
        
        # Commit all changes
        db.commit()
        
        print(f"\n{'='*60}")
        print(f"✅ Import Complete!")
        print(f"{'='*60}")
        print(f"Active work orders imported: {imported}")
        print(f"Completed work orders imported: {completed_imported}")
        print(f"Rows skipped: {skipped}")
        print(f"Errors: {len(errors)}")
        
        if errors:
            print(f"\n⚠️  Errors encountered:")
            for error in errors[:10]:  # Show first 10 errors
                print(f"  - {error}")
            if len(errors) > 10:
                print(f"  ... and {len(errors) - 10} more")
        
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python import_csv.py <path_to_csv>")
        print("Example: python import_csv.py '../frontend/public/SMT Production Schedule 2.0 - Schedule_Table_SMT.csv'")
        sys.exit(1)
    
    csv_path = sys.argv[1]
    print(f"Importing from: {csv_path}")
    import_work_orders(csv_path)


