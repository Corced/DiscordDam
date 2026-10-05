## Description
<!-- What does this PR do? -->

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Security patch
- [ ] Infrastructure / CI change
- [ ] Documentation

## Testing Checklist
- [ ] Unit tests pass locally (`pnpm test:unit`)
- [ ] Integration tests pass locally (`pnpm test:integration`)
- [ ] Manually tested the changed flow end-to-end

## Security Checklist
- [ ] No secrets or tokens committed to the repo
- [ ] No new way to reach ADMIN role via Discord OAuth
- [ ] TARGET_GUILD_ID read from env — not hardcoded anywhere
- [ ] All user input goes through parameterized queries or zod validation

## Screenshots
<!-- If UI changes — include before/after screenshots -->