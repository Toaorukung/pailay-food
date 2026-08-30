import { redirect } from 'next/navigation';

/**
 * Guests arrive from a link in the LINE Official Account, which points at
 * /order. The bare root exists only so a typed-in domain does not dead-end,
 * and it sends people to the same place that link does.
 */
export default function HomePage() {
  redirect('/order');
}
