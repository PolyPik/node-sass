const {
  existsSync: exists,
  mkdirSync,
} = require('fs');
const {
  join,
  normalize
} = require('path');
const { Readable } = require('stream');
const eol = require('eol');
const { archiveFromStream } = require('node-hrx');
const through2 = require('through2');
const vfs = require('vinyl-fs');
const Vinyl = require('vinyl');

const srcSpecPath = normalize(require('sass-spec').dirname);
const destSpecPath = normalize('test/fixtures/sass-spec');

if(!exists(destSpecPath)) {
  mkdirSync(destSpecPath);
}

const extractHrxDir = function(dir) {
  let files = [];
  for (const entryName of dir) {
    const entry = dir.contents[entryName];
    if(entry.isDirectory()) {
      files = files.concat(extractHrxDir(entry));
    } else {
      files.push(entry);
    }
  }

  return files;
};

vfs.src(
  join(srcSpecPath, '**/*').replace(/\\/g, '/').replace(/^\w:/, '')
).pipe(
  through2.obj(async function(file, enc, callback) {
    if(file.extname === '.hrx') {
      const stream = Readable.from(eol.lf(file.contents.toString()));
      const archive = await archiveFromStream(stream);
      const archivedFiles = extractHrxDir(archive);

      for (const fileObj of archivedFiles) {
        const path = join(file.path.slice(0,-4), fileObj.path);

        const extFile = new Vinyl({
          cwd: file.cwd,
          base: file.base,
          path,
          contents: Buffer.from(fileObj.body)
        });

        this.push(extFile);
      }

      callback();
    } else {
      callback(null, file);
    }
  })
).pipe(vfs.dest(destSpecPath));
