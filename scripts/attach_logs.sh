#!/bin/bash
CONTAINER_NAME="$1"

if [ -z "$CONTAINER_NAME" ]; then
  echo "Usage: $0 <container_name>"
  exit 1
fi

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