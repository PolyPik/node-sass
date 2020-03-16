const {
  createReadStream,
  existsSync: exists,
  mkdirSync,
  copy,
  outputFile
} = require('fs-extra');
const {
  join,
  basename,
  dirname
} = require('path');
const { promisify } = require('util');
const glob = promisify(require('glob'));
const { archiveFromStream } = require('node-hrx');
const srcSpecPath = require('sass-spec').dirname.replace(/\\/g, '/');
const destSpecPath = 'test/fixtures/sass-spec';

if(!exists(destSpecPath)) {
  mkdirSync(destSpecPath);
}

copy(srcSpecPath, destSpecPath)
  .then(async () => {
    const hrxFiles = await glob(srcSpecPath+'/**/*.hrx');
    const archives = await Promise.all(
      hrxFiles.map(async file => {
        const archive = await archiveFromStream(createReadStream(file, 'utf8'));

        return {
          archive,
          archivePath: file
        };
      })
    );
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

    const extrFiles = archives.reduce(
      (prevExtr, {archive, archivePath}) => {
        const fileObjs = extractHrxDir(archive).map(innerFile => {
          const path = join(
            dirname(archivePath),
            basename(archivePath, '.hrx'),
            innerFile.path
          ).replace(srcSpecPath, destSpecPath);

          return { path, body: innerFile.body };
        });

        return prevExtr.concat(fileObjs);
      },
      []
    );

    return Promise.all(extrFiles.map(({path, body}) => outputFile(path, body)));
  });
