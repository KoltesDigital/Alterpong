/**
 * @constructor
 */
function Object2D() {
	this.worldMatrix = mat4.create();
	
	this.position = vec2.create();
	this.scale = vec2.fromValues(1, 1);
	this.angle = 0;
}

Object2D.prototype.destroy = function() {};

Object2D.prototype.updateWorldMatrix = function() {
	var s0 = this.scale[0], s1 = this.scale[1];
	var c = Math.cos(this.angle), s = Math.sin(this.angle);
	
	this.worldMatrix[0] = c * s0;
	this.worldMatrix[1] = s * s0;
	this.worldMatrix[2] = 0;
	this.worldMatrix[3] = 0;
	
	this.worldMatrix[4] = - s * s1;
	this.worldMatrix[5] = c * s1;
	this.worldMatrix[6] = 0;
	this.worldMatrix[7] = 0;
	
	this.worldMatrix[8] = 0;
	this.worldMatrix[9] = 0;
	this.worldMatrix[10] = 1;
	this.worldMatrix[11] = 0;
	
	this.worldMatrix[12] = this.position[0];
	this.worldMatrix[13] = this.position[1];
	this.worldMatrix[14] = 0;
	this.worldMatrix[15] = 1;
};
