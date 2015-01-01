angular.module('pong', ['ngRoute'])

.config(['$locationProvider', '$routeProvider', function($locationProvider, $routeProvider) {
	$routeProvider
	.when('/lobby', {
		controller: 'Lobby',
		templateUrl: '/lobby/template.html'
	})
	.when('/sessions/:sessionId', {
		controller: 'Session',
		templateUrl: '/sessions/template.html'
	})
	.otherwise({
		controller: 'Index',
		templateUrl: '/index/template.html'
	});

	// configure html5 to get links working on jsfiddle
	$locationProvider.html5Mode(true);
}])
