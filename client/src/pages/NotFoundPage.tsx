import { Link } from 'react-router-dom';
import { Seo } from '../lib/seo';
import { Button, Section } from '../components/ui';

export default function NotFoundPage() {
  return (
    <>
      <Seo
        title="Page not found"
        description="The page you were looking for does not exist."
        noindex
      />

      <Section className="py-24 text-center max-w-xl">
        <p className="text-6xl font-extrabold text-cyan-700">404</p>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">We could not find that page</h1>
        <p className="mt-3 text-slate-600 leading-relaxed">
          The link may be out of date, or the page may have moved. Here is where most people are
          heading:
        </p>

        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link to="/products">
            <Button size="lg">Shop supplies</Button>
          </Link>
          <Link to="/book">
            <Button size="lg" variant="secondary">
              Book a service
            </Button>
          </Link>
          <Link to="/track">
            <Button size="lg" variant="ghost">
              Track an order
            </Button>
          </Link>
        </div>

        <p className="mt-8 text-sm text-slate-500">
          Still stuck?{' '}
          <Link to="/contact" className="font-semibold text-cyan-700 hover:underline">
            Contact our team
          </Link>
          .
        </p>
      </Section>
    </>
  );
}
