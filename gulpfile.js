'use strict';

const _            = require('lodash');
const fs           = require('fs-extra');
const path         = require('path');
const gulp         = require('gulp');
const gulpif       = require('gulp-if');
const del          = require('del');
const changed      = require('gulp-changed');
const eslint       = require('gulp-eslint');
const livereload   = require('gulp-livereload');
const environments = require('gulp-environments');
const nodemon      = require('nodemon');
const less         = require('gulp-less');
const autoprefixer = require('gulp-autoprefixer');
const concat       = require('gulp-concat');
const cssmin       = require('gulp-minify-css');
const sourcemaps   = require('gulp-sourcemaps');
const gulpwebpack  = require('gulp-webpack');
const webpack      = require('webpack');
const argv         = require('yargs').argv;
const config       = require('./roastr.config.js');
const development  = environments.development;
const production   = environments.production;
const path_server  = process.cwd();
const app          = argv.app || 'main';

/**
 * Prefixes the build path to the given path
 * 
 * @param {string} [path]
 * @returns {string}
 */
function pathBuild(path) {
    let build_path = 'public/' + app;
    if (path) {
        build_path += '/' + path;
    }
    
    return build_path;
}

/**
 * Prefixes the app path to the given path
 * 
 * @param {string} [path]
 * @returns {string}
 */
function pathApp(path) {
    let apps_path = 'apps/' + app;
    if (path) {
        apps_path += '/' + path;
    }
    
    return apps_path;
}

/**
 * Prefixes the app public path to the given path
 * 
 * @param {string} [path]
 * @returns {string}
 */
function pathAppPublic(path) {
    let public_path = 'apps/' + app + '/public';
    if (path) {
        public_path += '/' + path;
    }
    
    return public_path;
}

/**
 * Adds ".min" to the given filename
 * 
 * @param {string} filename
 * @returns {*}
 */
function minifyFilename(filename) {
    return filename.replace(/(.*?)\.(.*?)$/, '$1.min.$2');
}

/**
 * Returns a boolean indicating whether a file exists
 * 
 * @param {string} filename
 * @returns {boolean}
 */
function fileExists(filename) {
    let exists = true;
    try {
        fs.statSync(filename);
    }
    catch(err) {
        exists = false;
    }
    
    return exists;
}

/**
 * 
 */
gulp.task('create', function() {
    const path_app    = pathApp();
    const path_skel   = path.resolve('../skeleton');
    const to_sync     = [
        {src: path.join(path_skel,'config'), dest: path.join(path_server,'config')},
        {src: path.join(path_skel,'public'), dest: path.join(path_server,'public')},
        {src: path.join(path_skel,'logs'),   dest: path.join(path_server,'logs')},
        {src: path.join(path_skel,'app'),    dest: path_app}
    ];
    
    to_sync.forEach(function(sync) {
        fs.copySync(sync.src, sync.dest);
    });
    fs.renameSync(
        path.join(path_server, 'config/development.yml'),
        path.join(path_server, 'config/' + app + '.development.yml')
    );
    fs.renameSync(
        path.join(path_server, 'config/production.yml'),
        path.join(path_server, 'config/' + app + '.production.yml')
    );
    
    let index_dest = path.join(path_server, 'index.js');
    if (!fs.existsSync(index_dest)) {
        let source = fs.readFileSync(path.join(path_skel, 'server/index.js')).toString();
        source = source.replace('{{app_name}}', app);
        fs.writeFileSync(index_dest, source);
    }
    
    gulp.start('default');
});

/**
 * 
 */
gulp.task('clean', function(cb) {
    del([pathBuild('**')], cb);
});

/**
 * 
 */
gulp.task('assets', function() {
    let sources = config.assets.sources || [];
    let source  = null;
    let dest    = null;
    
    sources.forEach(function(asset) {
        if (!fileExists(pathAppPublic(asset))) {
            throw 'File or directory "' + pathAppPublic(asset) + '" does not exist.';
        }
        
        source = asset;
        dest   = '';
        if (fs.statSync(pathAppPublic(asset)).isDirectory()) {
            source = asset + '/**';
            dest   = asset;
        }
        gulp.src(pathAppPublic(source))
            .pipe(changed(pathBuild(dest)))
            .pipe(gulp.dest(pathBuild(dest)));
    });
});

/**
 *
 */
gulp.task('less', function() {
    return gulp.src(pathAppPublic('less/**/*.less'))
        .pipe(development(
            sourcemaps.init()
        ))
        .pipe(less())
        .pipe(autoprefixer(config.css.autoprefixer))
        .pipe(development(
            concat(config.css.output)
        ))
        .pipe(production(
            concat(minifyFilename(config.css.output))
        ))
        .pipe(production(
            cssmin()
        ))
        .pipe(development(
            sourcemaps.write()
        ))
        .pipe(gulp.dest(pathBuild('css')))
        .pipe(development(
            gulpif(config.livereload, livereload())
        ));
});

/**
 *
 */
gulp.task('webpack', function() {
    var webpack_config = config.webpack;
    if (production()) {
        delete webpack_config.devtool;
        delete webpack_config.output.sourceMapFilename;
        webpack_config.output.filename = minifyFilename(webpack_config.output.filename);
        webpack_config.plugins = [
            new webpack.optimize.UglifyJsPlugin(),
            new webpack.optimize.OccurenceOrderPlugin()
        ];
    }
    
    return gulp.src(pathAppPublic('scripts/app.js'))
        .pipe(gulpwebpack(webpack_config))
        .pipe(gulp.dest(pathBuild('scripts')))
        .pipe(development(
            gulpif(config.livereload, livereload())
        ));
});

/**
 *
 */
gulp.task('lint', function() {
    return gulp.src(pathAppPublic('**/*.js'))
        .pipe(eslint())
        .pipe(eslint.format())
        .pipe(eslint.failAfterError());
});

/**
 *
 */
gulp.task('serve', function() {
    nodemon({
        script: 'index.js',
        ext: 'js,yml',
        watch: [
            'config',
            'server',
            pathApp()
        ]
    });
});

/**
 *
 */
gulp.task('default', ['webpack', 'less', 'assets']);

/**
 *
 */
gulp.task('watch', ['default'], function() {
    if (config.livereload) {
        livereload.listen();
    }
    
    gulp.watch([
        pathAppPublic('scripts/**/*.js')
    ], ['webpack']);
    gulp.watch([
        pathAppPublic('less/**/*.less')
    ], ['less']);
    gulp.watch([
        pathAppPublic('images/**/*')
    ], ['assets']);
});

/**
 *
 */
gulp.task('serve-watch',  ['serve', 'watch']);
