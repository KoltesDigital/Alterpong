angular.module('pong')
.controller('Lobby', ['$location', '$scope', function($location, $scope) {
	var sock = new SockJS('/ws');
	var found = false;
	
	function send(args) {
		return sock.send(JSON.stringify(args));
	}
	
	sock.onopen = function() {
		send(['lobby']);
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
			case 'enter':
				found = true;
				$scope.$apply(function() {
					return $location.url('/sessions/' + message[1]);
				});
				break;
		}
	};
	
	sock.onclose = function() {
		if (!found)
			$scope.$apply(function() {
				return $location.url('/');
			});
	};
	
	$scope.$on('$destroy', function() {
		sock.close();
	});
}])
