import { useEffect, useState } from 'react';
import App from './App';
import DemoPage from './pages/DemoPage';

function getRoute(): 'demo' | 'app' {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash === 'demo' || hash.startsWith('demo/')) return 'demo';
  return 'app';
}

export default function Root() {
  const [route, setRoute] = useState<'demo' | 'app'>(getRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (route === 'demo') return <DemoPage />;
  return <App />;
}
