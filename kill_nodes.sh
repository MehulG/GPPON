#!/bin/bash

# Find and kill all Node.js processes running setup.js
echo "Finding GPPON nodes..."
pids=$(pgrep -f "node.*setup.js")

if [ -z "$pids" ]; then
    echo "No GPPON nodes found running"
    exit 0
fi

echo "Found GPPON processes with PIDs: $pids"
echo "Killing processes..."

# Kill each process
for pid in $pids; do
    kill -9 $pid
    echo "Killed process $pid"
done

echo "All GPPON nodes have been terminated"