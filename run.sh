#!/bin/bash
clear 2> /dev/null

# Make sure scripts are runnable
chmod +x ./scripts/tsc_stopper.sh
chmod +x ./scripts/attach_logs.sh
chmod +x ./scripts/start_tsc.sh

# Try to kill older tsc process
pkill -f "start_tsc"

# Clean dist
rm -rf dist
mkdir -p dist db
mkdir -p dist/{commands,tasks}/{public,dev} dist/data dist/temp dist/db

# Run TypeScript compiler & watcher
rm ./.tsbuildinfo
npx tsc
if [ $? -ne 0 ]; then
    echo "❌ Initial TypeScript compilation failed. Exiting."
    exit 1
fi
setsid ./scripts/start_tsc.sh < /dev/null > tsc-watch.log 2>&1 &

# Send .env file & bot data over
cp -r .env src/data dist/

# If stopping the container: cleanup compiler
CONTAINER_NAME="notary"

setsid ./scripts/tsc_stopper.sh "$CONTAINER_NAME" < /dev/null &

# Start docker
docker compose up --build -d

# Ensure we follow logs
./scripts/attach_logs.sh "$CONTAINER_NAME"
