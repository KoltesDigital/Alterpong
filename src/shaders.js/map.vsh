attribute vec2 position;

uniform mat4 worldMatrix;
uniform mat4 projectionViewMatrix;

varying vec2 pos;

void main() {
	gl_Position = projectionViewMatrix * worldMatrix * vec4(position, 0.0, 1.0);
	pos = position;
}
