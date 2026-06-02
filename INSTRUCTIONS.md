# Publishing Instructions

This project uses a GitHub Actions workflow (`.github/workflows/npm-publish.yml`) to automatically publish the package to the npm registry.

## 1. Prerequisites: npm Authentication Token

To allow GitHub Actions to publish on your behalf, you must provide an automation token from npm.

1. Log in to [npmjs.com](https://www.npmjs.com/).
2. Click your profile picture (top right) and select **Access Tokens**.
3. Click **Generate New Token**.
4. Choose **Automation** (this bypasses two-factor authentication for CI/CD pipelines).
5. Copy the generated token. *(Keep it secure!)*

## 2. GitHub Secrets Setup

You need to save this token securely in your GitHub repository.

1. Go to your repository on GitHub: [JMartynov/mongo-schema-fetch](https://github.com/JMartynov/mongo-schema-fetch).
2. Click on **Settings** (the gear icon).
3. In the left sidebar, navigate to **Secrets and variables** -> **Actions**.
4. Click the **New repository secret** button.
5. Set the **Name** exactly to: `npm_token`
6. Paste the token you copied from npm into the **Secret** field.
7. Click **Add secret**.

## 3. How to Trigger a New Release

The pipeline is configured to run *only* when a new GitHub Release is created.

To publish a new version:

1. **Bump Version:** Update the `version` field in your `package.json` (e.g., from `1.0.0` to `1.0.1`). npm will reject the publish if the version already exists.
2. **Commit and Push:** Commit your changes (including the version bump) and push to the `main` branch.
3. **Create Release:** On your GitHub repository page, click **Releases** (on the right sidebar) -> **Draft a new release**.
4. **Tag:** Click **Choose a tag** and create a new tag matching your version (e.g., `v1.0.1`).
5. **Publish:** Add a release title/notes and click **Publish release**.

Once the release is published, the GitHub Actions pipeline will automatically run your tests, build the TypeScript project, and publish the new version to npm.
