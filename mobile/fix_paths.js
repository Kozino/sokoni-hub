const fs = require('fs');
const glob = require('glob');

const files = glob.sync('mobile/src/**/*.tsx');
files.forEach(file => {
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/require\(['"]\.\/assets\//g, "require('../../assets/");
    code = code.replace(/require\(['"]\.\.\/assets\//g, "require('../../assets/");
    fs.writeFileSync(file, code);
});
