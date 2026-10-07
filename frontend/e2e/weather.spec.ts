import { expect, test } from '@playwright/test'
import { anonymous, preference, signedIn, weather } from '../src/test/fixtures'
import { forecastDate, forecastLabel, groupForecast } from '../src/forecast'

test('keyboard auth, full multi-day forecast, selected snapshot, repeated fresh reopening and reflow', async ({ page }) => {
  let authenticated = false
  let saved = false
  const backendRequests: string[] = []
  const externalRequests: string[] = []
  const pageErrors: string[] = []
  let lookups = 0
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') externalRequests.push(request.url())
  })
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    backendRequests.push(`${request.method()} ${path}`)
    if (request.method() !== 'GET') {
      expect(request.headers()['x-csrf-token']).toBe(authenticated ? signedIn.csrfToken : anonymous.csrfToken)
    }
    let body: unknown
    let status = 200
    if (path.endsWith('/auth/session')) body = authenticated ? signedIn : anonymous
    else if (path.endsWith('/auth/register')) { body = { user: signedIn.user }; status = 201 }
    else if (path.endsWith('/auth/login')) { authenticated = true; body = signedIn }
    else if (path.endsWith('/auth/logout')) { authenticated = false; status = 204 }
    else if (path.endsWith('/weather')) {
      const params = new URL(request.url()).searchParams
      expect(params.has('units')).toBe(false)
      if (params.has('latitude')) {
        expect(params.get('latitude')).toBe('59.3293')
        expect(params.get('longitude')).toBe('18.0686')
        expect(params.has('q')).toBe(false)
      }
      body = ++lookups === 1 ? weather : {
        ...weather,
        forecast: [{
          ...weather.forecast[0], temperatureC: 25,
          condition: { code: 'clear', description: `Fresh forecast update ${lookups}` },
        }, ...weather.forecast.slice(1)],
      }
    } else if (path === '/api/v1/preferences' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({ location: weather.location, snapshot: preference.snapshot })
      saved = true
      body = { preference }
      status = 201
    } else if (request.method() === 'DELETE') { saved = false; status = 204 }
    else if (path === '/api/v1/preferences') body = { preferences: saved ? [preference] : [] }
    else throw new Error(`Unexpected endpoint: ${path}`)
    await route.fulfill({ status, contentType: 'application/json', ...(status === 204 ? {} : { body: JSON.stringify(body) }) })
  })
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const response = await route.fetch()
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
      },
    })
  })
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Register' })).toBeVisible()
  await page.keyboard.press('Tab')
  // Main heading receives initial route focus; navigation remains keyboard-operable.
  await page.getByRole('link', { name: 'Register' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeFocused()
  await page.getByLabel('Email').fill('reader@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page.getByText('Account created. Log in with your email and password.')).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  await page.getByLabel('Email').fill('reader@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page.getByText('Signed in', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Signed in', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Register', exact: true })).toHaveCount(0)
  await page.getByLabel('City', { exact: true }).fill('Stockholm')
  await page.getByLabel('Country code (optional)').fill('se')
  await page.getByLabel('Country code (optional)').press('Enter')
  const hero = page.getByRole('region', { name: 'Selected forecast' })
  await expect(hero.getByText('12.4', { exact: true })).toBeVisible()
  await expect(page.locator('.forecast-rows li')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 4 })).toHaveCount(1)
  await expect(page.getByText(/Partial day - available times/)).toHaveCount(1)
  const daySelector = page.getByRole('group', { name: 'Forecast days' })
  await expect(daySelector.getByRole('button')).toHaveCount(6)
  await expect(page.getByText('23:00', { exact: true }).first()).toBeVisible()
  const pointLabel = forecastLabel(weather.forecast[0].forecastAt, weather.timezoneOffsetSeconds)
  await page.getByRole('button', { name: `Save forecast for Stockholm, ${pointLabel}`, exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: `Saved forecast for Stockholm, ${pointLabel}`, exact: true })).toBeDisabled()
  const secondPoint = weather.forecast[1]
  await daySelector.getByRole('button', { name: forecastDate(secondPoint.forecastAt, weather.timezoneOffsetSeconds), exact: true }).click()
  await expect(page.locator('.forecast-rows li')).toHaveCount(8)
  const secondControl = page.getByRole('button', {
    name: `${forecastLabel(secondPoint.forecastAt, weather.timezoneOffsetSeconds)}, 11.2 °C, Light rain`, exact: true,
  })
  await secondControl.focus()
  await page.keyboard.press('Space')
  await expect(secondControl).toBeFocused()
  await expect(secondControl).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.forecast-rows button[aria-pressed="true"]')).toHaveCount(1)
  await expect(daySelector.locator('button[aria-pressed="true"]')).toHaveCount(1)
  await expect(hero.getByText('11.2', { exact: true })).toBeVisible()
  await expect(hero.getByText('Light rain', { exact: true })).toBeVisible()
  const selectedColors = await secondControl.evaluate((element) => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, text: style.color }
  })
  expect(selectedColors).toEqual({ background: 'rgb(37, 99, 235)', text: 'rgb(255, 255, 255)' })
  for (const day of groupForecast(weather)) {
    await daySelector.getByRole('button', { name: day.label, exact: true }).click()
    await expect(page.locator('.forecast-rows li')).toHaveCount(day.points.length)
    await expect(page.getByRole('heading', { level: 4 })).toHaveText(day.label)
  }
  const interactive = await page.locator('main button:visible, main input:visible, main a:visible, nav button:visible, nav a:visible')
    .evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }))
  expect(interactive.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/forecast-${test.info().project.name}.png`, fullPage: true })
  await page.reload()
  await expect(page.getByText('Signed in', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Saved forecasts' }).getByText('Saved forecast snapshot')).toBeVisible()
  const location = page.getByRole('button', { name: /Open fresh forecast for Stockholm/ })
  await location.focus()
  await page.keyboard.press('Enter')
  await expect(hero.getByText('Fresh forecast update 2')).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Stockholm, SE' })).toBeFocused()
  expect(await page.getByRole('heading', { level: 2, name: 'Stockholm, SE' }).evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none')
  await location.press('Enter')
  await expect(hero.getByText('Fresh forecast update 3')).toBeVisible()
  const snapshots = page.getByRole('region', { name: 'Saved forecasts' })
  await expect(snapshots.getByText('Saved forecast snapshot')).toBeVisible()
  await expect(snapshots.getByText('Overcast clouds')).toBeVisible()
  await expect(snapshots.getByText('12.4 °C')).toBeVisible()
  await expect(snapshots.getByText(/Forecast time:/)).toContainText('UTC')
  await expect(snapshots.getByText(/Saved at/)).toContainText('UTC')
  expect(lookups).toBe(3)
  await page.getByRole('button', { name: /Remove saved forecast for Stockholm/ }).click()
  await expect(location).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Saved forecasts' })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page.getByText('You are signed out.')).toBeVisible()
  expect(backendRequests).toContain('POST /api/v1/auth/register')
  expect(backendRequests).toContain('DELETE /api/v1/preferences/pref_test')
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(externalRequests).toEqual([])
  expect(pageErrors).toEqual([])
})

test('session errors keep public search and visible account navigation available', async ({ page }) => {
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({
    status: 503, contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable.', requestId: 'req_synthetic' } }),
  }))
  await page.route('**/api/v1/weather?*', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(weather),
  }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Retry session' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Register', exact: true })).toBeVisible()
  await page.getByLabel('City', { exact: true }).fill('Stockholm')
  await page.getByRole('button', { name: 'Show forecast' }).click()
  await expect(page.getByRole('heading', { name: 'Stockholm, SE' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Save forecast for/ })).toHaveCount(0)
})

test('scoped skeletons preserve real controls, final geometry and reduced-motion behavior', async ({ page }) => {
  let releaseSession!: () => void
  let releasePreferences!: () => void
  let releaseWeather!: () => void
  const sessionGate = new Promise<void>((resolve) => { releaseSession = resolve })
  const preferenceGate = new Promise<void>((resolve) => { releasePreferences = resolve })
  const weatherGate = new Promise<void>((resolve) => { releaseWeather = resolve })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/v1/auth/session', async (route) => {
    await sessionGate
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(signedIn) })
  })
  await page.route('**/api/v1/preferences', async (route) => {
    await preferenceGate
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ preferences: [preference] }) })
  })
  await page.route('**/api/v1/weather?*', async (route) => {
    await weatherGate
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(weather) })
  })
  await page.goto('/')
  const account = page.getByRole('navigation', { name: 'Account' })
  await expect(account).toHaveAttribute('aria-busy', 'true')
  await expect(account.locator('[aria-hidden="true"]')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Show forecast' })).toBeEnabled()
  releaseSession()
  await expect(page.getByText('Signed in', { exact: true })).toBeVisible()
  const saved = page.getByRole('region', { name: 'Saved forecasts' })
  await expect(saved).toHaveAttribute('aria-busy', 'true')
  await expect(saved.locator('.bg-skeleton').first()).toBeVisible()
  await expect(saved.getByText(/No saved forecasts yet/)).toHaveCount(0)
  await page.getByLabel('City', { exact: true }).fill('Stockholm')
  await page.getByRole('button', { name: 'Show forecast' }).click()
  const forecast = page.getByRole('region', { name: 'Multi-day forecast' })
  await expect(forecast).toHaveAttribute('aria-busy', 'true')
  await expect(forecast.locator('.bg-skeleton').first()).toBeVisible()
  const skeletonHero = await forecast.locator(':scope > div > div').first().boundingBox()
  await expect(forecast.getByRole('button')).toHaveCount(0)
  expect(await forecast.locator('.bg-skeleton').first().evaluate(element => getComputedStyle(element).animationName)).toBe('none')
  const geometry = await forecast.locator(':scope > div').last().evaluate(element => {
    const style = getComputedStyle(element)
    return { display: style.display, columns: style.gridTemplateColumns.split(' ').length }
  })
  expect(geometry).toEqual({ display: 'grid', columns: test.info().project.name === 'desktop' || test.info().project.name === 'laptop' ? 2 : 1 })
  releaseWeather()
  const hero = page.getByRole('region', { name: 'Selected forecast' })
  await expect(hero).toBeVisible()
  const loadedHero = await hero.boundingBox()
  expect(Math.abs(skeletonHero!.height - loadedHero!.height)).toBeLessThan(64)
  await expect(forecast.locator('.bg-skeleton')).toHaveCount(0)
  releasePreferences()
  await expect(saved.getByText('Saved forecast snapshot')).toBeVisible()
  await expect(saved.locator('.bg-skeleton')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('direct login deep link and invalid-form keyboard focus', async ({ page }) => {
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(anonymous),
  }))
  await page.goto('/login/')
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Log in', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Email')).toBeFocused()
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('compact auth shells, field/server errors and keyboard focus indicators', async ({ page }) => {
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(anonymous),
  }))
  await page.route('**/api/v1/auth/login', (route) => route.fulfill({
    status: 401, contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.', requestId: 'req_synthetic' } }),
  }))
  await page.goto('/login')
  const heading = page.getByRole('heading', { level: 1, name: 'Welcome back' })
  await expect(heading).toBeFocused()
  expect(await heading.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none')
  const loginShell = page.getByRole('region', { name: 'Log in', exact: true })
  const viewport = page.viewportSize()!
  const shellBox = (await loginShell.boundingBox())!
  expect(shellBox.y + shellBox.height).toBeLessThan(viewport.height)
  if (viewport.width >= 1024) expect(shellBox.width).toBeGreaterThanOrEqual(900)
  await expect(loginShell.locator('svg')).toBeVisible({ visible: viewport.width >= 768 })
  const nav = page.getByRole('navigation', { name: 'Account' })
  expect(await nav.getByRole('link', { name: 'Register' }).evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(37, 99, 235)')
  expect(await nav.getByRole('link', { name: 'Log in' }).evaluate(element => getComputedStyle(element).textDecorationLine)).toBe('none')
  await page.screenshot({ path: `test-results/login-${test.info().project.name}.png`, fullPage: true })

  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByLabel('Email')).toBeFocused()
  await expect(page.getByText('Use 12-128 characters.', { exact: true })).toHaveCount(1)
  await expect(page.getByText('Use 12-128 characters. Spaces are preserved.', { exact: true })).toHaveCount(0)
  await page.getByLabel('Email').fill('reader@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password' }).click()
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toHaveText('The email or password is incorrect.')
  await expect(alert).toBeFocused()
  expect(await alert.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none')
  expect((await alert.boundingBox())!.height).toBeLessThan(100)
  await expect(page.getByText(/req_synthetic/)).toHaveCount(0)
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Email')).toBeFocused()
  expect(await page.getByLabel('Email').evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid')
  await page.screenshot({ path: `test-results/auth-error-${test.info().project.name}.png`, fullPage: true })

  await nav.getByRole('link', { name: 'Register' }).click()
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeFocused()
  const registerBox = (await page.getByRole('region', { name: 'Register', exact: true }).boundingBox())!
  expect(registerBox.y + registerBox.height).toBeLessThan(viewport.height)
  await page.screenshot({ path: `test-results/register-${test.info().project.name}.png`, fullPage: true })
  await page.getByRole('banner').getByRole('link', { name: 'Weather' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your weather, simply' })).toBeFocused()
  expect(await page.getByRole('heading', { level: 1 }).evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none')
  const empty = (await page.getByRole('heading', { name: 'The coming days, at a glance' }).locator('..').locator('..').boundingBox())!
  expect(empty.height).toBeLessThan(330)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/empty-home-${test.info().project.name}.png`, fullPage: true })
})

test('long contract-sized locations and descriptions wrap without page overflow', async ({ page }) => {
  const description = 'w'.repeat(200)
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(anonymous),
  }))
  await page.route('**/api/v1/weather?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ...weather,
      location: { ...weather.location, name: 'City'.repeat(25) },
      forecast: [{ ...weather.forecast[0], condition: { code: 'other', description } }],
    }),
  }))
  await page.goto('/')
  await page.getByLabel('City', { exact: true }).fill('Stockholm')
  await page.getByRole('button', { name: 'Show forecast' }).click()
  await expect(page.getByRole('region', { name: 'Selected forecast' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const textFits = await page.locator('.forecast-rows').getByText(description, { exact: true })
    .evaluate(element => element.scrollWidth <= element.clientWidth)
  expect(textFits).toBe(true)
})

test('saved snapshots use compact responsive cards below a single full-day forecast', async ({ page }) => {
  const point = weather.forecast[1]
  const secondPreference = {
    ...preference, id: 'pref_second',
    snapshot: { forecastAt: point.forecastAt, temperatureC: point.temperatureC, description: point.condition.description },
  }
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(signedIn),
  }))
  await page.route('**/api/v1/preferences', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ preferences: [preference, secondPreference] }),
  }))
  await page.route('**/api/v1/weather?*', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(weather),
  }))
  await page.goto('/')
  const saved = page.getByRole('region', { name: 'Saved forecasts' })
  const cards = saved.getByRole('listitem')
  await expect(cards).toHaveCount(2)
  const first = (await cards.nth(0).boundingBox())!
  const second = (await cards.nth(1).boundingBox())!
  if (page.viewportSize()!.width >= 768) {
    expect(first.y).toBe(second.y)
    expect(second.x).toBeGreaterThan(first.x)
  } else {
    expect(first.x).toBe(second.x)
    expect(second.y).toBeGreaterThan(first.y)
  }
  expect(first.height).toBeLessThan(360)
  await page.getByLabel('City', { exact: true }).fill('Stockholm')
  await page.getByRole('button', { name: 'Show forecast' }).click()
  await page.getByRole('group', { name: 'Forecast days' }).getByRole('button', {
    name: forecastDate(point.forecastAt, weather.timezoneOffsetSeconds), exact: true,
  }).click()
  await expect(page.locator('.forecast-rows li')).toHaveCount(8)
  await expect(page.getByRole('region', { name: 'Selected forecast' }).getByText('Light rain', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/saved-cards-${test.info().project.name}.png`, fullPage: true })
})
