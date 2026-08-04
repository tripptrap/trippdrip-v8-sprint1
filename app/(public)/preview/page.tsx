import PreviewClient from './PreviewClient';
import { landingMetadata } from '@/lib/landingMetadata';

// Same component and same metadata as the root route — see lib/landingMetadata
// for why this is imported rather than restated.
export const metadata = landingMetadata;

export default function PreviewPage() {
  return <PreviewClient />;
}
