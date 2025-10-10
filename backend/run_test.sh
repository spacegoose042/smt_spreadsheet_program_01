#!/bin/bash
# Run optimizer test suite
# Usage: ./run_test.sh "your_database_url_here"

if [ -z "$1" ]; then
    echo "Usage: ./run_test.sh 'postgresql://user:pass@host:port/db'"
    exit 1
fi

export DATABASE_URL="$1"
python3 test_optimizer.py

