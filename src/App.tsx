import { HashRouter } from 'react-router-dom';
import { DataProvider } from './app/DataProvider';
import { Layout } from './app/Layout';
import type { Repository } from './data/repository';

export default function App({ repo }: { repo: Repository }) {
  return (
    <DataProvider repo={repo}>
      <HashRouter>
        <Layout />
      </HashRouter>
    </DataProvider>
  );
}
