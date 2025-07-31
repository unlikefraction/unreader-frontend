import posthog from 'posthog-js'

posthog.init('phc_8CyOzFvrraB0asG5M4IPk7rFiSQ7k9EWPg0qazr6kzM',
    {
        api_host: 'https://us.i.posthog.com',
        person_profiles: 'always' // or 'always' to create profiles for anonymous users as well
    }
)