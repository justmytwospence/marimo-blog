import Link from 'next/link';

export default function About() {
  return <main><h1>About this example</h1>
    <p>The article is loaded from a precompiled local manifest on the server. Building this site does not run Python.</p>
    <Link href="/">Back to the article</Link>
  </main>;
}
