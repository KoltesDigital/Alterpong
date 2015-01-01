function quadGeometry(gl) {
	var attributes = new Float32Array([
		- 0.5, - 0.5, 
		  0.5, - 0.5,
		  0.5,   0.5,
		- 0.5,   0.5,
	]);
	
	var arrayBuffer = gl.createBuffer();
	
	gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, attributes, gl.STATIC_DRAW);
	
	return {
		array: arrayBuffer
	};
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

function Ball(pads) {
	Object2D.call(this);
	
	this.pads = pads;
	
	this.x = new PFloat(0, PFloat.LINEAR, constants.maxBallDY * 1.01);
	this.y = new PFloat(0, PFloat.LINEAR, constants.maxBallDY * 1.01);
}

Ball.prototype = Object.create(Object2D.prototype);

Ball.prototype.setPosition = function(x, y) {
	this.x.target = x;
	this.y.target = y;
	
	var dx = x - this.x.current;
	var dy = y - this.y.current;
	if (dx * dx + dy * dy > 0.5) {
		this.x.current = x;
		this.y.current = y;
	}
};

Ball.prototype.update = function(dt) {
	this.x.update(dt);
	this.y.update(dt);
	
	this.position[0] = this.x.current;
	this.position[1] = this.y.current;
};

function Border(i) {
	Object2D.call(this);
	
	vec2.set(this.position, 0, i ? (constants.verticalBorder + 1) : -(constants.verticalBorder + 1));
	vec2.set(this.scale, 50, 1);
	
	this.updateWorldMatrix();
}

Border.prototype = Object.create(Object2D.prototype);

function Pad(i) {
	Object2D.call(this);
	
	vec2.set(this.position, (constants.horizontalDistance + 1) * (i ? 1 : -1), 0);
	vec2.set(this.scale, 1, 4);
	
	this.active = false;
	this.y = new PFloat(0, PFloat.EXP, 20.0);
}

Pad.prototype = Object.create(Object2D.prototype);

Pad.prototype.setY = function(y) {
	this.y.target = y;
	// this.position[1] = y;
};

Pad.prototype.update = function(dt) {
	this.y.update(dt);
	this.position[1] = this.y.current;
};

var Screen = {
	HOME: 0,
	START: 1,
	GAME: 2,
	WIN: 3,
	LOSE: 4
};

angular.module('pong')
.controller('Session', ['$location', '$routeParams', '$scope', function($location, $routeParams, $scope) {
	var sessionId = $routeParams.sessionId;
	
	if (!sessionId)
		return $location.url('/');
	
	try {
		var container = document.getElementById('game');
		var canvas = document.createElement('canvas');
		var gl = this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
	} catch (err) {
		return console.error(err);
	}
	
	container.appendChild(canvas);
	
	document.body.classList.add('fullscreen');
	
	var scores = document.getElementById('scores');
	var score0 = document.getElementById('score0');
	var score1 = document.getElementById('score1');
	
	var qrcode = document.getElementById('qrcode');
	new QRCode(qrcode, {
		text: location.href.toString(),
		correctLevel : QRCode.CorrectLevel.L
	});
	
	var qrcodeTimeout;
	function showQrcode() {
		qrcode.style.visibility = 'visible';
	}
	
	try {
		var ac = new AudioContext();
		
		var gain = ac.createGain();
		gain.connect(ac.destination);
		gain.gain.setValueAtTime(0, 0);
		
		var oscillator = ac.createOscillator();
		oscillator.connect(gain);
		oscillator.type = 'square';
		oscillator.start(0);
	} catch(err) {
		console.warn("No audio context");
	}
	
	function playNote(step, stepDuration) {
		if (!ac)
			return;
			
		var now = ac.currentTime;
		
		oscillator.frequency.setValueAtTime(constants.note(step), now);
		
		gain.gain.cancelScheduledValues(now);
		gain.gain.setValueAtTime(0.5, now);
		gain.gain.setValueAtTime(0, now + stepDuration * 0.1);
	}
	
	var Melodies = {
		WIN: [233.08, 196.00, 261.63],
		LOSE: [174.61, 155.56, 130.81]
	}
	
	function playMelody(melody) {
		if (!ac)
			return;
			
		var delay = 0.25;
		
		var now = ac.currentTime;
		
		for (var i = 0; i < melody.length; ++i)
			oscillator.frequency.setValueAtTime(melody[i], now + delay * i);
		
		gain.gain.cancelScheduledValues(now);
		gain.gain.setValueAtTime(0.5, now);
		gain.gain.setValueAtTime(0, now + delay * melody.length);
	}
	
	var geometries = {
		quad: quadGeometry(gl)
	};
	
	function compileShader(type, source, name) {
		var shader = gl.createShader(type);
		gl.shaderSource(shader, 'precision mediump float;\n' + source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
			throw 'Compilation error ' + name + ': ' + gl.getShaderInfoLog(shader);
		return shader;
	}
	
	var shaders = {
		vertex: {},
		fragment: {}
	};
	
	for (var name in shaderSources.vertex)
		shaders.vertex[name] = compileShader(gl.VERTEX_SHADER, shaderSources.vertex[name], name);
	
	for (var name in shaderSources.fragment)
		shaders.fragment[name] = compileShader(gl.FRAGMENT_SHADER, shaderSources.fragment[name], name);
	
	function createProgram(vertexName, fragmentName) {
		var id = gl.createProgram();
		
		gl.attachShader(id, shaders.vertex[vertexName]);
		gl.attachShader(id, shaders.fragment[fragmentName]);
		
		gl.linkProgram(id);
		
		var linked = gl.getProgramParameter(id, gl.LINK_STATUS);
		if (!linked)
			throw 'Link error ' + vertexName + ' - ' + fragmentName + ': ' + gl.getProgramInfoLog(id);
		
		var program = {
			id: id
		};
		
		var na = gl.getProgramParameter(id, gl.ACTIVE_ATTRIBUTES);
		for (var i = 0; i < na; ++i) {
			var a = gl.getActiveAttrib(id, i);
			program[a.name] = gl.getAttribLocation(id, a.name);
		}
		
		var nu = gl.getProgramParameter(id, gl.ACTIVE_UNIFORMS);
		for (var i = 0; i < nu; ++i) {
			var u = gl.getActiveUniform(id, i);
			program[u.name] = gl.getUniformLocation(id, u.name);
		}
		
		return program;
	}
	
	var programs = {
		white: createProgram('map', 'white')
	};
	
	var cameraViewMatrix = mat4.create();
	var cameraProjectionMatrix = mat4.create();
	var cameraProjectionViewMatrix = mat4.create();
	
	var cameraAspect = 16 / 9;
	mat4.perspective(cameraProjectionMatrix, 1.2, cameraAspect, 1, 2000);
	
	var cameraPosition = vec3.fromValues(0, 0, 19.5);
	
	var width, height, left, top;
	function onWindowResize(event) {
		if (window.innerWidth / window.innerHeight < 16 / 9) {
			width = window.innerWidth;
			height = window.innerWidth / 16 * 9;
			left = 0;
			top = (window.innerHeight - height) / 2;
		} else {
			height = window.innerHeight;
			width = window.innerHeight * 16 / 9;
			left = (window.innerWidth - width) / 2;
			top = 0;
		}
		
		container.style.left = left + 'px';
		container.style.top = top + 'px';
		scores.style.fontSize = width + 'px';
		
		container.width = canvas.width = width;
		container.height = canvas.height = height;
		
		gl.viewport(0, 0, width, height);
		
		var qrWidth = Math.min(width, height) * 0.8;
		
		qrcode.style.left = ((width - qrWidth) / 2 + left) + 'px';
		qrcode.style.top = ((height - qrWidth) / 2 + top) + 'px';
		qrcode.style.width = qrWidth + 'px';
	}
	
	window.addEventListener('resize', onWindowResize);
	onWindowResize();
	
	var mouse = vec2.create();
	function unprojectMouse(event) {
		var vec = vec4.fromValues(
			( (event.clientX - left) / width ) * 2 - 1,
			- ( (event.clientY - top) / height ) * 2 + 1,
			0,
			1
		);
		
		var inverseProjectionViewMatrix = new Float32Array(16);
		mat4.invert(inverseProjectionViewMatrix, cameraProjectionViewMatrix);
		
		vec4.transformMat4(vec, vec, inverseProjectionViewMatrix);
		vec3.scale(vec, vec, 1 / vec[3]);
		
		vec3.subtract(vec, vec, cameraPosition);
		
		var distance = - cameraPosition[2] / vec[2];
		
		vec2.scaleAndAdd(mouse, cameraPosition, vec, distance);
	};
	
	var borders = [new Border(0), new Border(1)];
	var pads = [new Pad(0), new Pad(1)];
	var ball = new Ball(pads);
	
	var joined = false;
	var playing = false;
	var ownPlayerId, ownPad;
	
	var pingTime, serverHalfPing;
	var pingTimeout;
	
	var networkState = {
		screen: Screen.HOME,
		stepOffset: 0,
		stepDuration: constants.stepDuration(0),
		score0: 0,
		score1: 0
	};
	
	var predictedState = {};
	
	function resetPredictedState() {
		for (var key in networkState)
			predictedState[key] = networkState[key];
	}
	
	resetPredictedState();
	
	var cache = {};
	
	function resetCache() {
		cache.stepDuration = constants.stepDuration(predictedState.step) / 1000;
	}
	
	function sendPing() {
		pingTime = Date.now();
		send(['ping']);
	}
	
	var sock = new SockJS('/ws');
	
	function send(args) {
		return sock.send(JSON.stringify(args));
	}
	
	sock.onopen = function() {
		send(['join', sessionId]);
		sendPing();
	};
	
	sock.onmessage = function(e) {
		try {
			var message = JSON.parse(e.data);
		} catch (err) {
			console.warn(e.data);
			return console.error(err);
		}
		
		if (message[0] !== 'pong' && message[0] !== 'y')
			console.log(message);
		
		switch (message[0]) {
			case 'ball':
				if (!pads[0].active || !pads[1].active)
					return;
				
				if (networkState.screen === Screen.GAME) {
					++networkState.step;
					networkState.emitter = 1 - networkState.emitter;
				} else {
					networkState.screen = Screen.GAME;
				}
				
				networkState.throwY = message[1];
				networkState.throwDY = message[2];
				networkState.stepOffset = serverHalfPing;
				resetPredictedState();
				resetCache();
				playNote(networkState.step, cache.stepDuration);
				break;
				
			case 'err':
				$scope.error = message[1];
				$scope.$digest();
				break;
				
			case 'joined':
				joined = true;
				ownPlayerId = message[1];
				ownPad = pads[ownPlayerId];
				ownPad.active = true;
				setTimeout(function() {
					send(['ready']);
				}, 1000);
				qrcodeTimeout = setTimeout(showQrcode, 500);
				break;
				
			case 'leave':
				var playerId = message[1];
				pads[playerId].active = false;
				networkState.screen = Screen.TITLE;
				resetPredictedState();
				score0.innerHTML = '';
				score1.innerHTML = '';
				qrcodeTimeout = setTimeout(showQrcode, 500);
				break;
				
			case 'new':
				networkState.score0 = 0;
				networkState.score1 = 0;
				resetPredictedState();
				score0.innerHTML = predictedState.score0;
				score1.innerHTML = predictedState.score1;
				break;
				
			case 'opponent':
				var playerId = message[1];
				pads[playerId].active = true;
				qrcode.style.visibility = 'hidden';
				clearTimeout(qrcodeTimeout); qrcodeTimeout = null;
				break;
				
			case 'pong':
				serverHalfPing = (Date.now() - pingTime) / 2000;
				pingTimeout = setTimeout(sendPing, 200);
				break;
				
			case 'score':
				var playerId = message[1];
				playMelody(playerId === ownPlayerId ? Melodies.WIN : Melodies.LOSE);
				networkState.screen = (playerId === ownPlayerId ? Screen.WIN : Screen.LOSE);
				++networkState['score' + playerId];
				networkState.emitter = playerId;
				resetPredictedState();
				resetCache();
				score0.innerHTML = predictedState.score0;
				score1.innerHTML = predictedState.score1;
				ball.x.current = ball.y.current = 0;
				break;
				
			case 'start':
				networkState.screen = Screen.START;
				score0.innerHTML = predictedState.score0;
				score1.innerHTML = predictedState.score1;
				networkState.emitter = message[1];
				networkState.stepOffset = serverHalfPing;
				networkState.step = 0;
				resetPredictedState();
				resetCache();
				break;
				
			case 'y':
				var playerId = message[1];
				if (playerId !== ownPlayerId) {
					pads[playerId].setY(message[2]);
				}
				break;
		}
	};
	
	sock.onclose = function() {
		clearTimeout(pingTimeout); pingTimeout = null;
		$scope.$apply(function() {
			return $location.url('/');
		});
	};
	
	this.yInterval = setInterval(function() {
		if (ownPad)
			send(['y', ownPad.position[1]]);
	}, 100);
	
	// container.addEventListener('mousedown', function(event) {
	// });
	
	container.addEventListener('mousemove', function(event) {
		event.preventDefault();
		event.stopPropagation();
		
		if (ownPad) {
			unprojectMouse(event);
			ownPad.setY(mouse[1]);
		}
	});
	
	// container.addEventListener('mouseup', function(event) {
	// });
	
	// container.addEventListener('touchstart', function(event) {
	// });
	
	container.addEventListener('touchmove', function(event) {
		event.preventDefault();
		event.stopPropagation();
		
		if (ownPad && event.touches.length > 0) {
			unprojectMouse(event.touches[0]);
			ownPad.setY(mouse[1]);
			send(['y', mouse[1]]);
		}
	});
	
	// container.addEventListener('touchend', function(event) {
	// });
	
	gl.disable(gl.DEPTH_TEST);
	gl.depthMask(false);
	
	var startTime = Date.now();
	var lastTime = 0;
	var time, dt;
	
	function animate() {
		requestAnimationFrame(animate);
		
		if (!joined)
			return;
		
		gl.clear(gl.COLOR_BUFFER_BIT);
		
		time = (Date.now() - startTime) / 1000;
		dt = time - lastTime;
		lastTime = time;
		
		predictedState.stepOffset += dt;
		var stepTime = predictedState.stepOffset / cache.stepDuration;
		
		for (var i = 0, n = pads.length; i < n; ++i) {
			var pad = pads[i];
			
			pad.update(dt);
		}
		
		// self.cameraX.update(dt);
		// self.cameraY.update(dt);
		// self.cameraZ.update(dt);
		
		cameraViewMatrix[12] = - cameraPosition[0];
		cameraViewMatrix[13] = - cameraPosition[1];
		cameraViewMatrix[14] = - cameraPosition[2];
		mat4.multiply(cameraProjectionViewMatrix, cameraProjectionMatrix, cameraViewMatrix);
		
		gl.bindBuffer(gl.ARRAY_BUFFER, geometries.quad.array);
		gl.useProgram(programs.white.id);
		
		gl.enableVertexAttribArray(programs.white.position);
		gl.vertexAttribPointer(programs.white.position, 2, gl.FLOAT, false, 2 * 4, 0);
		
		gl.uniformMatrix4fv(programs.white.projectionViewMatrix, false, cameraProjectionViewMatrix);
		
		if (predictedState.screen === Screen.START) {
			if (predictedState.screen === Screen.GAME || predictedState.screen === Screen.START) {
				var blindPhase = Math.floor(stepTime * 3 + predictedState.emitter) % 2;
				if (ownPlayerId !== blindPhase) {
					scores.style.visibility = 'hidden';
					return;
				}
			}
			scores.style.visibility = '';
			
			if (predictedState.stepOffset >= cache.stepDuration) {
				predictedState.screen = Screen.GAME;
				predictedState.step = 0;
				predictedState.stepOffset -= cache.stepDuration;
				predictedState.throwY = pads[predictedState.emitter].position[1];
				predictedState.throwDY = predictedState.throwY / constants.verticalBorder * constants.maxBallDY / 2;
				
				resetCache();
				stepTime = predictedState.stepOffset / cache.stepDuration;
			}
		}
		
		if (predictedState.screen === Screen.GAME) {
			if (predictedState.stepOffset >= cache.stepDuration) {
				++predictedState.step;
				
				var receiver = 1 - predictedState.emitter;
				
				var y = bounce(predictedState.throwY + predictedState.throwDY);
				if (Math.abs(y - pads[receiver].position[1]) >= 2.5) {
					predictedState.screen = (predictedState.emitter === ownPlayerId ? Screen.WIN : Screen.LOSE);
					++predictedState['score' + predictedState.emitter];
					score0.innerHTML = predictedState.score0;
					score1.innerHTML = predictedState.score1;
				} else {
					predictedState.stepOffset -= cache.stepDuration;
					predictedState.emitter = receiver;
					predictedState.throwY = y;
					predictedState.throwDY = Math.min(Math.max((y - pads[receiver].position[1]) / 2, -1), 1) * constants.maxBallDY;
					
					resetCache();
					stepTime = predictedState.stepOffset / cache.stepDuration;
				}
			}
			
			if (predictedState.screen === Screen.GAME || predictedState.screen === Screen.START) {
				var blindPhase = Math.floor(stepTime * 3 + predictedState.emitter) % 2;
				if (ownPlayerId === blindPhase) {
					scores.style.visibility = 'hidden';
					return;
				}
			}
			scores.style.visibility = '';
			
			ball.setPosition(
				(1 - stepTime * 2) * constants.horizontalDistance * (predictedState.emitter ? 1 : -1),
				bounce(predictedState.throwY + stepTime * predictedState.throwDY)
			);
			
			ball.update(dt);
			ball.updateWorldMatrix();
			
			gl.uniformMatrix4fv(programs.white.worldMatrix, false, ball.worldMatrix);
			
			gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
		}
		
		for (var i = 0, n = borders.length; i < n; ++i) {
			var border = borders[i];
		
			gl.uniformMatrix4fv(programs.white.worldMatrix, false, border.worldMatrix);
			
			gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
		}
		
		for (var i = 0, n = pads.length; i < n; ++i) {
			var pad = pads[i];
			
			if (pad.active) {
				pad.updateWorldMatrix();
				
				gl.uniformMatrix4fv(programs.white.worldMatrix, false, pad.worldMatrix);
				
				gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
			}
		}
	}
	
	animate();
	
	$scope.$on('$destroy', function() {
		if (ac) {
			gain.disconnect();
			oscillator.disconnect();
		}
		
		sock.close();
	});
}])
