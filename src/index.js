'use strict';

// Server entrypoint — imports the app and binds to a port.

const app = require('./app');

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
	console.log(`WhatsApp bot listening on port ${port}`);
});
