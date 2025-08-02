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
setsid npx tsc --watch --preserveWatchOutput --incremental < /dev/null &

# Send .env file & bot data over
cp -r .env src/data dist/

# If stopping the container: cleanup compiler
CONTAINER_NAME="kof-bot"

setsid ./scripts/tsc_stop.sh "$CONTAINER_NAME" < /dev/null &

# Start docker
docker compose up --build -d

# Ensure we follow logs
while true; do
	sleep 1
	# Check container status
	status=$(docker inspect -f '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null)
	echo $status

	if [ "$status" = "running" ]; then
		echo "Container (re)started, attaching to new logs..."
		docker logs --since 2s -f "$CONTAINER_NAME"
		
		code=$?
		if [ $code -eq 1 ]; then
			echo "Interrupted by user (Ctrl+C). Exiting loop."
			break
		else
			echo "Container stop."
			sleep 1
		fi
	else
		sleep 2
		break
	fi
done
