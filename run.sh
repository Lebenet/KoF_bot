#!/bin/bash
clear 2> /dev/null

# Try to kill older tsc process
pkill -f "tsc --watch"

# Clean dist
mkdir -p dist
rm -rf ./dist/*
mkdir -p dist/{commands,tasks}/{public,dev} dist/data dist/temp

# Run TypeScript compiler & watcher
npx tsc --watch &

# Send .env file & bot data over
cp -r .env src/data dist/

# Wait a lil for compilation
sleep 3

# Start docker
docker compose up --build

# If manually Ctrl+C'd the docker: kill tsc manually
pkill -f "tsc --watch"