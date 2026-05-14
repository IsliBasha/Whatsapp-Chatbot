'use strict';

// exec_mode MUST stay 'fork' — cluster mode would desync the in-memory catalogue
module.exports = {
	apps: [
		{
			name:               'whatsapp-bot',
			script:             'src/index.js',
			instances:          1,
			exec_mode:          'fork',
			autorestart:        true,
			watch:              false,
			max_memory_restart: '512M',
			out_file:           './logs/out.log',
			error_file:         './logs/error.log',
			merge_logs:         true,
			env: {
				NODE_ENV: 'development',
			},
			env_production: {
				NODE_ENV: 'production',
			},
		},
	],
};
