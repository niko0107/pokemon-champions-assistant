import { useId, useState, type InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, error, hint, id: providedId, ...props }: TextFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const descriptionId = error || hint ? `${id}-description` : undefined;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">
        {label}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={descriptionId}
        className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-700 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
      />
      {(error || hint) && (
        <p
          id={descriptionId}
          className={`text-sm ${error ? "font-medium text-red-700" : "text-slate-500"}`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: string;
  hint?: string;
}

export function PasswordField({
  label = "パスワード",
  error,
  hint,
  id: providedId,
  ...props
}: PasswordFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const descriptionId = error || hint ? `${id}-description` : undefined;
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">
        {label}
      </label>
      <div className="relative">
        <input
          {...props}
          id={id}
          type={isVisible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={descriptionId}
          className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white py-3 pr-20 pl-4 text-base text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-700 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
        <button
          type="button"
          aria-label={isVisible ? "パスワードを隠す" : "パスワードを表示"}
          aria-pressed={isVisible}
          onClick={() => setIsVisible((visible) => !visible)}
          className="absolute inset-y-1 right-1 rounded-xl px-3 text-sm font-semibold text-blue-800 outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-700"
        >
          {isVisible ? "隠す" : "表示"}
        </button>
      </div>
      {(error || hint) && (
        <p
          id={descriptionId}
          className={`text-sm ${error ? "font-medium text-red-700" : "text-slate-500"}`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
