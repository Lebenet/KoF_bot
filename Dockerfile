FROM node:latest

# Create the bot directory
RUN mkdir -p /usr/src/bot
WORKDIR /usr/src/bot

# Copy and install bot dependencies
COPY package.json /usr/src/bot
RUN npm install

# Copy the bot itself
COPY . /usr/src/bot

# Run the bot
CMD ["./run.sh"]

