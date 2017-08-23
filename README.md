# multicolour-auth-jwt

[![Greenkeeper badge](https://badges.greenkeeper.io/Multicolour/multicolour-auth-jwt.svg)](https://greenkeeper.io/)

JWT Auth plugin for HapiJS & Multicolour.

Get started by running `multicolour plugin-add hapi-jwt`

You'll need `multicolour_user`s before you can authorise anyone to use your API.

## Logging in

Posting to the `/session` endpoint will create your session.

```bash
curl -X POST http://localhost:1811/session -d '{"email": "hello@newworld.codes","password":"password"}' -H "Accept:application/json"
```
