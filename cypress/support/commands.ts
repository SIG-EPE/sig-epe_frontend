// cypress/support/commands.ts
// Custom Cypress commands

declare global {
  namespace Cypress {
    interface Chainable {
      login(dni: string, password: string): Chainable<void>
    }
  }
}

Cypress.Commands.add('login', (dni: string, password: string) => {
  cy.request('POST', 'http://localhost:3001/auth/login', {
    identifier: dni,
    password,
  }).then((response) => {
    // Set the access_token cookie so the middleware reads it
    cy.setCookie('access_token', response.body.accessToken)
  })
})

export {}
