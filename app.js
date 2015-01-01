var config = require('config-path')(__dirname + "/config.yml"),
	constants = require('./src/constants');

var async = require('async'),
	bodyParser = require('body-parser'),
	errorhandler = require('errorhandler'),
	express = require('express'),
	fs = require('fs'),
	http = require('http'),
	jade = require('connect-jade-html'),
	morgan = require('morgan'),
	nib = require('nib'),
	path = require('path'),
	sockjs = require('sockjs'),
	stylus = require('stylus'),
	util = require('util');

function randomId() {
	var id = Math.floor(Math.random() * 10000).toString();
	id = new Array(5 - id.length).join('0') + id;
	return id;
}

function bounce(y) {
	while (true) {
		if (y <= -constants.verticalBorder)
			y = - y - 2 * constants.verticalBorder;
		else if (y >= constants.verticalBorder)
			y = - y + 2 * constants.verticalBorder;
		else
			break;
	}
	return y;
}

function send(conn, args) {
	return conn.write(JSON.stringify(args));
}

function Game() {
	this.players = [null, null];
}

Game.prototype.broadcast = function(args, except) {
	var message = JSON.stringify(args);
	
	for (var i = 0, n = this.players.length; i < n; ++i) {
		if (this.players[i] && i !== except) {
			this.players[i].conn.write(message);
		}
	}
};

Game.prototype.destroy = function(conn) {
	clearInterval(this.updateInterval);
};

Game.prototype.join = function(conn) {
	for (var i = 0; i < 2; ++i) {
		if (!this.players[i]) {
			this.players[i] = {
				conn: conn,
				ready: false,
				score: 0,
				y: 0
			};
			this.setY(i, 0);
			
			send(conn, ['joined', i]);
			
			var j = 1 - i;
			if (this.players[j]) {
				send(this.players[j].conn, ['opponent', i]);
				send(conn, ['opponent', j]);
				send(conn, ['y', j, this.players[j].y]);
			}
			
			return i;
		}
	}
	return null;
};

Game.prototype.leave = function(playerId) {
	this.players[playerId] = null;
	this.broadcast(['leave', playerId]);
	
	this.playing = false;
	clearTimeout(this.updateTimeout); this.updateTimeout = null;
	
	return this.players.every(function(player) { return !player; });
};

Game.prototype.setReady = function(playerId) {
	this.players[playerId].ready = true;
	
	if (!this.playing && this.players.every(function(player) { return player && player.ready; })) {
		this.playing = true;
		this.emitter = 1 - playerId;
		this.startGame();
	}
};

Game.prototype.startGame = function() {
	this.broadcast(['new']);
	this.players[0].score = 0;
	this.players[1].score = 0;
	return this.startRound();
};

Game.prototype.startRound = function() {
	var self = this;
	var emitter = this.emitter;
	this.broadcast(['start', emitter]);
	
	var step = 0;
	
	function update() {
		++step;
		var receiver = 1 - self.emitter;
		
		self.throwY = bounce(self.throwY + self.throwDY);
		
		if (Math.abs(self.throwY - self.players[receiver].y) >= 2.5) {
			self.broadcast(['score', self.emitter]);
			self.updateTimeout = setTimeout(self.startRound.bind(self), 1000);
		} else {
			self.emitter = receiver;
			throwBall();
		}
	}
	
	function throwBall() {
		self.throwDY = Math.min(Math.max((self.throwY - self.players[self.emitter].y) / 2, -1), 1) * constants.maxBallDY;
		self.updateTimeout = setTimeout(update, constants.stepDuration(step));
		self.broadcast(['ball', self.throwY, self.throwDY]);
	}
	
	self.updateTimeout = setTimeout(function() {
		self.throwY = self.players[self.emitter].y;
		self.throwDY = self.throwY / constants.verticalBorder * constants.maxBallDY / 2;
		self.updateTimeout = setTimeout(update, constants.stepDuration(step));
		self.broadcast(['ball', self.throwY, self.throwDY]);
	}, constants.stepDuration(step));
};

Game.prototype.setY = function(playerId, y) {
	this.players[playerId].y = y;
	this.broadcast(['y', playerId, y], playerId);
};

module.exports = function(options, callback) {
	var sock = sockjs.createServer(options.sockjs);
	
	var games = {};
	
	var lobby = [];
	
	sock.on('connection', function(conn) {
		var game, gameId, playerId;
		var inLobby;
		
		function leaveGame() {
			if (inLobby) {
				var index = lobby.indexOf(conn);
				if (index !== -1)
					lobby.splice(index, 1);
				inLobby = false;
			}
			
			if (game && game.leave(playerId)) {
				game.destroy();
				delete games[gameId];
				console.log('delete game %s', gameId);
			}
			game = null;
		}
		
		conn.on('data', function(data) {
			try {
				var message = JSON.parse(data);
			} catch (err) {
				console.warn(data);
				return console.error(err);
			}
			
			switch (message[0]) {
				case 'join':
					leaveGame();
					
					gameId = message[1];
					game = games[gameId];
					if (!game) {
						games[gameId] = game = new Game();
					}
					
					playerId = game.join(conn);
					if (playerId === null) {
						game = null;
						send(conn, ['err', 'game-full']);
					}
					break;
					
				case 'lobby':
					lobby.push(conn);
					inLobby = true;
					if (lobby.length > 1) {
						var tries = 0;
						do {
							var id = randomId();
							++tries;
						} while (games.hasOwnProperty(id) || tries > 100);
						if (tries > 100)
							break;
						for (var i = 0; i < 2; ++i)
							send(lobby.pop(), ['enter', id]);
					}
					break;
				
				case 'ping':
					send(conn, ['pong']);
					break;
				
				case 'ready':
					game.setReady(playerId);
					break;
					
				case 'y':
					game.setY(playerId, message[1]);
					break;
					
				default:
					console.log('unknown %j', message);
					break;
			}
		});
		
		conn.on('close', function() {
			return leaveGame();
		});
	});

	var app = express();

	var srcDir = path.join(__dirname, "src");
	var destDir = path.join(__dirname, "dest");
	
	app.set('views', srcDir);
	app.set('view engine', 'jade');

	if (options.trustProxy)
		app.enable('trust proxy');

	if (app.get('env') === 'development')
		app.use(morgan('dev'));
		
	app.use(bodyParser.json());
	
	app.use(jade({
		src: srcDir,
		dest: destDir
	}));
	
	app.use(stylus.middleware({
		src: srcDir,
		dest: destDir,
		compile: function compile(str, path) {
			return stylus(str)
				.set('filename', path)
				.set('compress', true)
				.use(nib())
				.import('nib');
		}
	}));

	app.use(express.static(srcDir));
	app.use(express.static(destDir));
	
	app.use(errorhandler());
	
	function angular(req, res) {
		return res.render("index");
	}
	
	app.get("/", angular);
	app.get("/lobby", angular);
	app.get("/sessions/:sessionId", angular);
	
	app.get("/shaders.js", function(req, res, next) {
		var shadersDir = path.join(srcDir, "shaders.js");
		return fs.readdir(shadersDir, function(err, files) {
			if (err) return next(err);
			
			var shaders = {
				vertex: {},
				fragment: {}
			};
			
			return async.each(files, function(file, callback) {
				var parts = file.split(".");
				
				if (parts[1] === 'vsh') {
					return fs.readFile(path.join(shadersDir, file), function(err, data) {
						if (err) return callback(err);
						
						shaders.vertex[parts[0]] = data.toString();
						return callback();
					});
				} else if (parts[1] === 'fsh') {
					return fs.readFile(path.join(shadersDir, file), function(err, data) {
						if (err) return callback(err);
						
						shaders.fragment[parts[0]] = data.toString();
						return callback();
					});
				} else
					return callback();
			}, function(err) {
				if (err) return next(err);
				
				res.type('js');
				res.send(util.format("shaderSources = %j;", shaders))
			});
		});
	});
	
	var server = http.createServer(app);
	sock.installHandlers(server);
	return callback(null, server, app);
};

if (require.main === module) {
	module.exports(config, function(err, server, app) {
		if (err) throw err;
		
		var port = process.env.PORT || config.port;
		server.listen(port, function(){
			console.log("Pong server listening on port %d in mode %s", port, app.get('env'));
		});
	});
}
