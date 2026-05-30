const parse = require('mongodb-schema');
const { Readable } = require('stream');

const s = new Readable({
  objectMode: true,
  read() {
    this.push({ a: 1 });
    this.push(null);
  }
});

parse.default(s, { semanticTypes: true })
  .then(schema => console.log('success', schema))
  .catch(err => console.error('err', err));
