#!/bin/bash
clear 2> /dev/null

# Try to kill older tsc process
mkdir -p processes
if [[ -f processes/bot_tsc_watcher ]]; then
	pkill -f "tsc --watch"
fi

# Clean dist
rm -rf ./dist/*

# Run TypeScript compiler & watcher
npx tsc --watch &

# Send .env file & bot data over
cp -r .env src/data dist/

mkdir -p dist/{commands,tasks}/{public,dev} dist/data dist/temp

# Start docker
docker compose up --build

# If manually Ctrl+C'd the docker: kill tsc manually
pkill -f "tsc --watch"