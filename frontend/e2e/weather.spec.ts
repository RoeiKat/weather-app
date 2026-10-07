import { expect, test } from '@playwright/test'
import { anonymous, preference, signedIn, weather } from '../src/test/fixtures'
import { forecastLabel } from '../src/forecast'

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
  await expect(page.getByRole('heading', { level: 1, name: 'Register' })).toBeFocused()
  await page.getByLabel('Email').fill('reader@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page.getByText('Account created. Log in with your email and password.')).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  await page.getByLabel('Email').fill('reader@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page.getByText('Signed in', { exact: true })).toBeVisible()
  await page.getByLabel('City', { exact: true }).fill('Stockholm')
  await page.getByLabel('Country code (optional)').fill('se')
  await page.getByLabel('Country code (optional)').press('Enter')
  await expect(page.getByText('12.4 °C')).toBeVisible()
  await expect(page.locator('.forecast-rows li')).toHaveCount(40)
  await expect(page.getByRole('heading', { level: 4 })).toHaveCount(6)
  await expect(page.getByText('Partial day - available times')).toHaveCount(2)
  await expect(page.getByText('23:00', { exact: true }).first()).toBeVisible()
  const pointLabel = forecastLabel(weather.forecast[0].forecastAt, weather.timezoneOffsetSeconds)
  await page.getByRole('button', { name: `Save forecast for Stockholm, ${pointLabel}`, exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: `Saved forecast for Stockholm, ${pointLabel}`, exact: true })).toBeDisabled()
  const interactive = await page.locator('main button:visible, main input:visible, main a:visible, nav button:visible, nav a:visible')
    .evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }))
  expect(interactive.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/forecast-${test.info().project.name}.png`, fullPage: true })
  const location = page.getByRole('button', { name: /Open fresh forecast for Stockholm/ })
  await location.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Fresh forecast update 2')).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Stockholm, SE' })).toBeFocused()
  await location.press('Enter')
  await expect(page.getByText('Fresh forecast update 3')).toBeVisible()
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
  expect(externalRequests).toEqual([])
  expect(pageErrors).toEqual([])
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
