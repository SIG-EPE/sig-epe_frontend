import { defineConfig } from "cypress";

export default defineConfig({
  env: {
    apiUrl: process.env.CYPRESS_apiUrl,
    giofDni: process.env.CYPRESS_giofDni,
    giofPassword: process.env.CYPRESS_giofPassword,
    requesterDni: process.env.CYPRESS_requesterDni,
    requesterPassword: process.env.CYPRESS_requesterPassword,
  },
  e2e: {
    baseUrl: "http://localhost:3000",
    setupNodeEvents(_on, _config) {
      // implement node event listeners here
    },
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
  },
});
