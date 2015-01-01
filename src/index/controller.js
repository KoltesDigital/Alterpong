angular.module('pong')

.controller('Index', ['$location', '$scope', function($location, $scope) {
	function randomId() {
		var id = Math.floor(Math.random() * 10000).toString();
		id = new Array(5 - id.length).join('0') + id;
		return id;
	}
	
	$scope.sessionId = $scope.wantedSessionId = randomId();
	
	$scope.computeSessionId = function() {
		$scope.sessionId = $scope.wantedSessionId.replace(/\W+/g, "");
	};
	
	$scope.lobby = function() {
		return $location.url('/lobby');
	};
	
	$scope.join = function() {
		if ($scope.sessionId)
			return $location.url('/sessions/' + $scope.sessionId);
	};
}])
