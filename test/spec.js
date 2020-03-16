var assert = require('assert'),
  fs = require('fs'),
  exists = fs.existsSync,
  join = require('path').join,
  read = fs.readFileSync,
  statSync = fs.statSync,
  sass = process.env.NODESASS_COV
    ? require('../lib-cov')
    : require('../lib'),
  readYaml = require('read-yaml'),
  mergeWith = require('lodash/mergeWith'),
  glob = require('glob'),
  specPath = join(__dirname, 'fixtures/sass-spec/spec'),
  impl = function(entry) { return entry.match(/(sass\/)?libsass.*/g) !== null },
  version = 3.6;

var normalize = function(str) {
  // This should be /\r\n/g, '\n', but there seems to be some empty line issues
  return str.replace(/\s+/g, '');
};

var inputs = glob.sync(specPath + '/**/input.scss');

const getImplSpecificFileFactory = function(folder) {
  return function (fileName) {
    let implSpecificName;
    if(fileName.includes('.')) {
      const tokens = fileName.split('.');
      tokens.splice(1,0,'-libsass.');
      implSpecificName = tokens.join('');
    } else {
      implSpecificName = fileName.concat('-libsass');
    }

    const implSpecificPath = join(folder, implSpecificName);

    if(exists(implSpecificPath)) {
      return implSpecificPath;
    }

    return join(folder, fileName);
  }
}

var initialize = function(inputCss, options) {
  var testCase = {};
  var folders = inputCss.split('/');
  var folder = join(inputCss, '..');
  const getImplSpecificFile = getImplSpecificFileFactory(folder);
  testCase.folder = folder;
  testCase.name = folders[folders.length - 2];
  testCase.inputPath = inputCss;
  testCase.expectedPath = getImplSpecificFile('output.css');
  testCase.errorPath = null;
  testCase.warningPath = getImplSpecificFile('warning');
  testCase.optionsPath = join(folder, 'options.yml');
  if (exists(testCase.optionsPath)) {
    let yamlOptions;
    try {
      yamlOptions = readYaml.sync(testCase.optionsPath);
    } catch(error) {
      // This block needed to compensate for a duplicate key in spec/parser/operations/logic_eq/dimensions/pairs.hrx
      const yamlContents = read(testCase.optionsPath, 'utf8');
      if(yamlContents.match(/:todo:\n(- [\w-]+\n)*?- libsass/)) {
        yamlOptions = { ':todo': ['libsass'] }
      } else {
        throw error;
      }
    }
    options = mergeWith(Object.assign({}, options), yamlOptions, customizer);
  }
  testCase.includePaths = [
    folder,
    join(folder, 'sub'),
    specPath
  ];
  testCase.precision = parseFloat(options[':precision']) || 10;
  testCase.outputStyle = options[':output_style'] ? options[':output_style'].replace(':', '') : 'nested';
  testCase.todo = options[':todo'] !== undefined && options[':todo'] !== null && options[':todo'].some(impl);
  testCase.only = options[':only_on'] !== undefined && options[':only_on'] !== null && options[':only_on'];
  testCase.ignoreFor = options[':ignore_for'] !== undefined && options[':ignore_for'] !== null && options[':ignore_for'];
  testCase.warningTodo = options[':warning_todo'] !== undefined && options[':warning_todo'] !== null && options[':warning_todo'].some(impl);
  testCase.startVersion = parseFloat(options[':start_version']) || 0;
  testCase.endVersion = parseFloat(options[':end_version']) || 99;
  testCase.options = options;
  testCase.result = false;

  // Probe filesystem once and cache the results
  testCase.shouldFail = !exists(testCase.expectedPath);
  if(testCase.shouldFail) {
    testCase.errorPath = getImplSpecificFile('error');
  }
  testCase.verifyWarning = exists(testCase.warningPath) && !statSync(testCase.warningPath).isDirectory();
  return testCase;
};

var runTest = function(inputCssPath, options) {
  var test = initialize(inputCssPath, options);

  it(test.name, function(done) {
    if (test.todo || test.warningTodo) {
      this.skip('Test marked with TODO');
    } else if (test.only && (test.only.some(impl))) {
      this.skip('Tests marked for only: ' + test.only.join(', '));
    } else if (test.ignoreFor && (test.ignoreFor.some(impl))) {
      this.skip('Tests ignored for: ' + test.ignoreFor.join(', '));
    } else if (version < test.startVersion) {
      this.skip('Tests marked for newer Sass versions only');
    } else if (version > test.endVersion) {
      this.skip('Tests marked for older Sass versions only');
    } else {
      sass.render({
        file: test.inputPath,
        includePaths: test.includePaths,
        precision: test.precision,
        outputStyle: test.outputStyle
      }, function(error, result) {
        if (test.shouldFail) {
          const expectedError = read(test.errorPath, 'utf8').replace(/DEPRECATION WARNING:[\s\w\(\).\-"]+\n\n/,'');
          assert.equal(
            error.formatted.toString().split('\n')[0],
            expectedError.toString().split('\n')[0],
            'Should Error.\nOptions' + JSON.stringify(test.options)
          );
        } else if (exists(test.expectedPath)) {
          const expected = normalize(read(test.expectedPath, 'utf8'));
          assert.equal(
            normalize(result.css.toString()),
            expected,
            'Should equal with options ' + JSON.stringify(test.options)
          );
        }
        done();
      });
    }
  });
};

var specSuite = {
  name: 'spec',
  folder: specPath,
  tests: [],
  suites: [],
  options: {}
};

function customizer(objValue, srcValue) {
  if (Array.isArray(objValue)) {
    return objValue.concat(srcValue);
  }
}

var executeSuite = function(suite, tests) {
  var suiteFolderLength = suite.folder.split('/').length;
  var optionsFile = join(suite.folder, 'options.yml');
  if (exists(optionsFile)) {
    let yamlOptions;
    try {
      yamlOptions = readYaml.sync(optionsFile);
    } catch(error) {
      // This block needed to compensate for a duplicate key in spec/parser/operations/logic_eq/dimensions/pairs.hrx
      const yamlContents = read(testCase.optionsPath, 'utf8');
      if(yamlContents.match(/:todo:\n(- [\w-]+\n)*?- libsass/)) {
        yamlOptions = { ':todo': ['libsass'] }
      } else {
        throw error;
      }
    }
    suite.options = mergeWith(Object.assign({}, suite.options), yamlOptions, customizer);
  }

  // Push tests in the current suite
  tests = tests.filter(function(test) {
    var testSuiteFolder = test.split('/');
    var inputSass = testSuiteFolder[suiteFolderLength + 1];
    // Add the test if the specPath matches the testname
    if (inputSass === 'input.scss' || inputSass === 'input.sass') {
      suite.tests.push(test);
    } else {
      return test;
    }
  });

  if (tests.length !== 0) {
    var prevSuite = tests[0].split('/')[suiteFolderLength];
    var suiteName = '';
    var prevSuiteStart = 0;
    for (var i = 0; i < tests.length; i++) {
      var test = tests[i];
      suiteName = test.split('/')[suiteFolderLength];
      if (suiteName !== prevSuite) {
        suite.suites.push(
          executeSuite(
            {
              name: prevSuite,
              folder: suite.folder + '/' + prevSuite,
              tests: [],
              suites: [],
              options: Object.assign({}, suite.options),
            },
            tests.slice(prevSuiteStart, i)
          )
        );
        prevSuite = suiteName;
        prevSuiteStart = i;
      }
    }
    suite.suites.push(
      executeSuite(
        {
          name: suiteName,
          folder: suite.folder + '/' + suiteName,
          tests: [],
          suites: [],
          options: Object.assign({}, suite.options),
        },
        tests.slice(prevSuiteStart, tests.length)
      )
    );
  }
  return suite;
};
var allSuites = executeSuite(specSuite, inputs);
var runSuites = function(suite) {
  describe(suite.name, function(){
    suite.tests.forEach(function(test){
      runTest(test, suite.options);
    });
    suite.suites.forEach(function(subsuite) {
      runSuites(subsuite);
    });
  });
};
runSuites(allSuites);
