async = require 'async'
fs = require 'fs'
path = require 'path'

closureConfig = ->
	js: [
		'build/**/*.js',
		'lib/**/*.js',
		'src/*.js',
		'src/**/*.js'
	]
	jsOutputFile: 'export/game.js'
	maxBuffer: 500
	options:
		language_in: 'ECMASCRIPT5_STRICT'
		define: [
			'"DEBUG=false"',
			'"ASSETS_PATH=\'\'"'
		]
		externs: [
			process.env.CLOSURE_PATH + '/contrib/externs/angular-1.2.js',
			process.env.CLOSURE_PATH + '/contrib/externs/w3c_audio.js',
			process.env.CLOSURE_PATH + '/externs/webgl.js'
			process.env.CLOSURE_PATH + '/externs/html5.js'
		]

module.exports = (grunt) ->
	grunt.initConfig
		pkg: grunt.file.readJSON 'package.json'
		
		'closure-compiler':
			build: (->
				config = closureConfig()
				config.options.compilation_level = 'ADVANCED_OPTIMIZATIONS'
				config
				)()
					
			inspect: closureConfig()
		
		shaders:
			build:
				dest: 'build/shaders.js'
				fragmentShaders: 'src/**/*.fsh'
				vertexShaders: 'src/**/*.vsh'
		
		sync:
			export:
				files: [
					{
						cwd: 'dest'
						src: [
							'**',
						]
						dest: 'export'
					}
				]
				verbose: true
	
	grunt.loadNpmTasks 'grunt-closure-compiler'
	grunt.loadNpmTasks 'grunt-sync'
	
	grunt.registerTask 'default', ['shaders:build', 'closure-compiler:build', 'sync:export']
	grunt.registerTask 'inspect', ['shaders:build', 'closure-compiler:inspect', 'sync:export']
	
	grunt.registerMultiTask 'shaders', 'Compile shaders', ->
		shaders =
			fragment: {}
			vertex: {}
		
		for file in grunt.file.expand @data.fragmentShaders
			ext = path.extname file
			base = path.basename file, ext
			shaders.fragment[base] = grunt.file.read(file).toString().replace(/[\n\r\t]/g, "")
		
		for file in grunt.file.expand @data.vertexShaders
			ext = path.extname file
			base = path.basename file, ext
			shaders.vertex[base] = grunt.file.read(file).toString().replace(/[\n\r\t]/g, "")
		
		grunt.file.write @data.dest, 'var shaderSources = ' + JSON.stringify(shaders)