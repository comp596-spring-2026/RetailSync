# Skill: Auth Email Flows

## Use This When

The task specifically touches:

- verification email
- forgot password email
- reset password email
- invite email
- resend behavior
- email link copy/structure

## Workflow

1. confirm the email-triggering backend event
2. confirm the token source and expiry semantics
3. confirm the client route the email lands on
4. confirm the UI state after successful landing
5. confirm SMTP/config expectations if deployment behavior changed

## Must-Check Edge Cases

- duplicate email sends
- wrong `CLIENT_URL`
- expired token from email link
- invite email landing on wrong route
- HTML + text multipart consistency

## Validation

- backend auth email tests
- affected page tests
- mailer template sanity
