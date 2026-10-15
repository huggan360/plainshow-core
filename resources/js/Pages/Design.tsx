import AppShell from '@/Layouts/AppShell';
import { Avatar, Badge, Button, ButtonLink, Field, Frame, FrameHead, ListRow, Meter, Switch } from '@/Components/ui';
import { SharedProps } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import { useState } from 'react';

const SANS = ['Hanken Grotesk', 'Geist', 'Instrument Sans'];
const SERIF = ['Newsreader', 'Source Serif 4'];

export default function Design() {
    const { props } = usePage<SharedProps>();
    const user = props.auth.user!;
    const [switchOn, setSwitchOn] = useState(true);

    return (
        <AppShell title="Design" wide>
            <Head><link rel="stylesheet" href="/ui/css/font-candidates.css" /></Head>
            <div className="ps-page-head">
                <div>
                    <p className="ps-eyebrow">PlainShow UI kit</p>
                    <h1 className="ps-title">Design specimen</h1>
                    <p className="ps-muted">Pick the typefaces and check the boxes here before every page is restyled.</p>
                </div>
            </div>

            <section className="design-section">
                <h2 className="ps-heading design-section__title">Typefaces</h2>
                <div className="ps-frames ps-frames--3">
                    {SANS.map((family, index) => (
                        <Frame key={family} glow={index === 0 ? 'blue' : undefined}>
                            <div className="design-type" style={{ fontFamily: `'Candidate ${family}'` }}>
                                <div className="ps-between"><span className="ps-eyebrow">Interface</span>{index === 0 && <Badge tone="blue">Current</Badge>}</div>
                                <p className="design-type__name">{family}</p>
                                <p className="design-type__big">Hand off the work. Keep the craft.</p>
                                <p className="ps-soft">Inlägg, gallerier och dokument. The quick brown fox jumps over the lazy dog. 0123456789</p>
                                <div className="ps-inline"><span className="design-type__w400">Regular</span><span className="design-type__w500">Medium</span><span className="design-type__w600">Semibold</span></div>
                            </div>
                        </Frame>
                    ))}
                </div>
                <div className="ps-frames design-gap">
                    {SERIF.map((family, index) => (
                        <Frame key={family} glow={index === 0 ? 'warm' : undefined}>
                            <div className="design-type" style={{ fontFamily: `'Candidate ${family}'` }}>
                                <div className="ps-between"><span className="ps-eyebrow">Headings and reading</span>{index === 0 && <Badge tone="warm">Current</Badge>}</div>
                                <p className="design-type__name">{family}</p>
                                <p className="design-type__display">Do more with PlainShow, everywhere you work</p>
                                <p className="design-type__body">En vecka på Bali började med regn och slutade med solnedgångar över Uluwatu. Long-form posts read in this face.</p>
                            </div>
                        </Frame>
                    ))}
                </div>
            </section>

            <section className="design-section">
                <h2 className="ps-heading design-section__title">Boxes, after claude.ai/downloads</h2>
                <p className="ps-muted design-section__text">Outer radius 28 px, padding 10 px, inner radius 18 px. Compare with p5.png.</p>
                <h3 className="ps-title design-p5__title">Do more with PlainShow, everywhere you work</h3>
                <div className="ps-frames">
                    <Frame className="ps-span-all design-hero">
                        <div className="design-hero__grid">
                            <div className="design-hero__copy">
                                <h4 className="ps-frame__title">Dashboard</h4>
                                <p className="ps-frame__text">Your services, server health and recent activity in one place, arranged the way you like.</p>
                                <div className="ps-frame__foot"><ButtonLink href="/" variant="primary">Open the dashboard</ButtonLink></div>
                            </div>
                            <div className="design-hero__art" aria-hidden="true">
                                <div className="design-bubble">Show me what changed on the blog this week</div>
                                <div className="design-bubble design-bubble--right">Turn this gallery into a post</div>
                                <div className="design-bubble">Compile the report and share the PDF</div>
                            </div>
                        </div>
                    </Frame>
                    <Frame glow="green">
                        <FrameHead title="Services" text="Open any PlainShow service with the same account." />
                        <ul className="ps-list ps-frame__body">
                            <ListRow icon="bx-news" title="Blog" action={<Button size="sm">Open <i className="bx bx-right-top-arrow-circle" /></Button>} />
                            <ListRow icon="bx-code-curly" title="LaTeX" action={<Button size="sm">Open <i className="bx bx-right-top-arrow-circle" /></Button>} />
                            <ListRow icon="bx-server" title={<>Web <Badge tone="blue">Admin</Badge></>} action={<Button size="sm">Open <i className="bx bx-right-top-arrow-circle" /></Button>} />
                            <ListRow icon="bx-cloud" title="Cloud" action={<Button size="sm">Open <i className="bx bx-right-top-arrow-circle" /></Button>} />
                        </ul>
                    </Frame>
                    <Frame>
                        <FrameHead title="Account" text="One profile, one password and one place to manage both." />
                        <ul className="ps-list ps-frame__body">
                            <ListRow icon={<Avatar src={user.avatar} initials={user.initials} size="xs" />} title={user.name} action={<Button size="sm">Profile</Button>} />
                            <ListRow icon="bx-shield-quarter" title="Two-factor" action={<Button size="sm">Set up</Button>} />
                        </ul>
                    </Frame>
                </div>
            </section>

            <section className="design-section">
                <h2 className="ps-heading design-section__title">Components</h2>
                <div className="ps-frames">
                    <Frame>
                        <FrameHead title="Buttons and badges" />
                        <div className="ps-stack ps-frame__body">
                            <div className="ps-inline"><Button variant="primary">Primary</Button><Button>Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button><Button variant="gradient">Highlight</Button></div>
                            <div className="ps-inline"><Button size="sm" icon="bx-plus">Small</Button><Button iconOnly icon="bx-cog" aria-label="Settings" /><Button loading>Saving</Button></div>
                            <div className="ps-inline"><Badge>Neutral</Badge><Badge tone="blue">Beta</Badge><Badge tone="green">Online</Badge><Badge tone="amber">Moderator</Badge><Badge tone="red">Admin</Badge><Badge tone="violet">New</Badge><Badge tone="warm">Blog</Badge></div>
                        </div>
                    </Frame>
                    <Frame>
                        <FrameHead title="Form" />
                        <div className="ps-frame__body">
                            <Field label="Title" htmlFor="d-title"><input id="d-title" className="ps-input" placeholder="A week in Bali" /></Field>
                            <Field label="With an error" htmlFor="d-error" error="This field is required."><input id="d-error" className="ps-input" aria-invalid="true" /></Field>
                            <div className="ps-between"><label className="ps-check"><input type="checkbox" defaultChecked /> Keep me signed in</label><Switch checked={switchOn} onChange={setSwitchOn} label="Example switch" /></div>
                        </div>
                    </Frame>
                    <Frame glow="warm">
                        <FrameHead title="Account menu and avatars" text="Kept from the blog." />
                        <div className="design-account ps-frame__body">
                            <nav className="ps-account-menu">
                                <span className="ps-account-menu__item is-active"><i className="bx bx-user" />Profile</span>
                                <span className="ps-account-menu__item"><i className="bx bx-shield-quarter" />Security</span>
                                <span className="ps-account-menu__item"><i className="bx bx-link" />Connections</span>
                            </nav>
                            <div className="ps-inline"><Avatar src={user.avatar} initials={user.initials} size="xl" /><Avatar initials="HH" size="lg" /><Avatar initials="AB" /><Avatar initials="CD" size="sm" presence /></div>
                        </div>
                    </Frame>
                    <Frame variant="gradient">
                        <FrameHead title="Gradient frame" text="For emphasis only: an update, an alert, the active item." />
                        <div className="ps-stack ps-frame__body">
                            <div className="ps-frames">
                                <div className="ps-metric ps-metric--blue"><div className="ps-metric__label">Posts</div><div className="ps-metric__value">128</div></div>
                                <div className="ps-metric ps-metric--green"><div className="ps-metric__label">Online</div><div className="ps-metric__value">5</div></div>
                            </div>
                            <Meter value={64} label="Example" />
                        </div>
                    </Frame>
                </div>
            </section>
        </AppShell>
    );
}
