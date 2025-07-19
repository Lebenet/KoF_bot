#!/bin/bash
clear 2> /dev/null

# Try to kill older tsc process
mkdir -p processes
if [[ -f processes/bot_tsc_watcher ]]; then
	kill "$(cat processes/bot_tsc_watcher)" 2> /dev/null || true
fi

# Run TypeScript compiler & watcher
npx tsc --watch &

# Save PID to stop the process when necessary
echo $! > processes/bot_tsc_watcher

# Send .env file & bot data over
cp .env src/data dist/

mkdir -p dist/commands/public dist/commands/dev dist/tasks/public dist/tasks/dev dist/data dist/temp

# Start docker
docker compose up --build

# If manually Ctrl+C'd the docker: kill tsc manually
kill "$(cat processes/bot_tsc_watcher)" 2> /dev/null || true