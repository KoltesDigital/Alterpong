var constants = {
	horizontalDistance: 21,
	maxBallDY: 50,
	note: function(step) {
		return 220 * Math.pow(2, step / 12); 
	},
	stepDuration: function(step) {
		return 2000 * Math.exp(-step * 0.04);
	},
	verticalBorder: 12
};

if (typeof module !== 'undefined')
	module.exports = constants;
