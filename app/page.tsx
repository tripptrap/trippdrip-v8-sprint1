import PreviewClient from './(public)/preview/PreviewClient';
import { landingMetadata } from '@/lib/landingMetadata';

// hyvewyre.com. Renders the same component as /preview and now shares its
// metadata too — the two files used to carry byte-identical copies, and updating
// one left the other stale. See lib/landingMetadata.
export const metadata = landingMetadata;

export default function Home() {
  return <PreviewClient />;
}
