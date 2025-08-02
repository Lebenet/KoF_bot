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
setsid npx tsc --watch --preserveWatchOutput --incremental > tsc.log 2>&1 < /dev/null &

# Send .env file & bot data over
cp -r .env src/data dist/

# If stopping the container: cleanup compiler
CONTAINER_NAME="kof-bot"

docker events \
  --filter "event=stop" \
  --filter "container=$CONTAINER_NAME" \
  --since 1s |
while read -r event; do
	echo "[$(date)] Container $CONTAINER_NAME stopped event received."

	# wait a moment before checking
	sleep 3

	# Check if container is still running
	if ! docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" | grep -q true; then
		echo "[$(date)] Container $CONTAINER_NAME is not running anymore. Cleaning up..."
		pkill -f "tsc --watch"
		tput rc; tput el
		exit 0
	else
		echo "[$(date)] Container $CONTAINER_NAME restarted, skipping cleanup."
	fi
done &

# Start docker
docker compose up --build -d

# Ensure we follow logs
while true; do
	sleep 1
	# Check container status
	status=$(docker inspect -f '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null)
	echo $status

	if [ "$status" = "running" ]; then
		docker logs --since 2s -f "$CONTAINER_NAME"
		echo "Container restarted, attaching to new logs..."
		sleep 1
	else
		sleep 2
		break
	fi
done
