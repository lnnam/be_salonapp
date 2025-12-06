require('dotenv').config(); // Add at the top of server.js
const express = require("express");
const cors = require("cors");
const app = express();

var corsOptions = {
  origin: "*"
};

app.use(cors(corsOptions));

// parse requests of content-type - application/json
app.use(express.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// simple route
app.get("/", (req, res) => {
  res.json({ message: "This is my app. Pls do not hack!" });
});

// set port, listen for requests with graceful EADDRINUSE handling
const DEFAULT_PORT = Number(process.env.PORT) || 8080;

function startServer(port, attemptsLeft = 5) {
  const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}.`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use.`);
      if (attemptsLeft > 0) {
        const nextPort = port + 1;
        console.log(`Trying port ${nextPort} (attempts left: ${attemptsLeft - 1})...`);
        setTimeout(() => startServer(nextPort, attemptsLeft - 1), 500);
        return;
      }
      console.error('No available ports left to try. Please free the port or set PORT env var.');
      process.exit(1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  return server;
}

startServer(DEFAULT_PORT);


require('./app/routes/auth.routes')(app);
require('./app/routes/booking.routes')(app);
require('./app/routes/contact.routes')(app);


