#!/bin/bash
clear 2> /dev/null

# Try to kill older tsc process
pkill -f "tsc --watch"

# Clean dist
mkdir -p dist db
rm -rf ./dist/*
mkdir -p dist/{commands,tasks}/{public,dev} dist/data dist/temp

# Run TypeScript compiler & watcher
rm ./.tsbuildinfo
npx tsc
if [ $? -ne 0 ]; then
    echo "❌ Initial TypeScript compilation failed. Exiting."
    exit 1
fi
npx tsc --watch --preserveWatchOutput --incremental &

# Send .env file & bot data over
cp -r .env src/data dist/

# Start docker
docker compose up --build

# If manually Ctrl+C'd the docker: kill tsc manually
pkill -f "tsc --watch"
