FROM node:22-alpine

# Create the bot directory
RUN mkdir -p /usr/src/bot
WORKDIR /usr/src/bot

# Copy and install bot dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the bot itself (Static Fallback)
COPY . /usr/src/bot

# Run the bot
CMD ["./run.sh"]
