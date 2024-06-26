yarn add -D @repo/eslint-config
```

2. Create or update your `.eslintrc.js` file to extend the desired configuration:

```javascript
module.exports = {
  extends: ['@repo/eslint-config/react'], // or 'base' or 'node'
};
```

3. (Optional) Add a lint script to your `package.json`:

```json
{
  "scripts": {
    "lint": "eslint ."
  }
}
```

Now you can run `yarn lint` to lint your code using the shared configuration.