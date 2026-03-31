'use client';

interface ToolHeroProps {
    icon: string;
    title: string;
    description: string;
}

export default function ToolHero({ icon, title, description }: ToolHeroProps) {
    return (
        <div className="mb-8 text-center pt-4">
            <div className="inline-flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-xl shadow-lg shadow-indigo-500/30 shrink-0">
                    {icon}
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white">{title}</h1>
            </div>
            <p className="text-gray-400 text-sm max-w-sm mx-auto leading-relaxed px-4">
                {description}
            </p>
        </div>
    );
}
