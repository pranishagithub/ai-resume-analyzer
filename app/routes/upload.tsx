import {type FormEvent, useState} from 'react'
import Navbar from "~/components/Navbar";
import FileUploader from "~/components/FileUploader";
import {usePuterStore} from "~/lib/puter";
import {useNavigate} from "react-router";
import {convertPdfToImage} from "~/lib/pdf2img";
import {generateUUID} from "~/lib/utils";
import {prepareInstructions, AIResponseFormat} from "../../constants";

const Upload = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const { fs, ai, kv } = usePuterStore();
    const navigate = useNavigate();

    const handleFileSelect = (file: File | null) => {
        setFile(file);
    }

    const handleAnalyze = async ({
                                     companyName,
                                     jobTitle,
                                     jobDescription,
                                     file,
                                 }: {
        companyName: string;
        jobTitle: string;
        jobDescription: string;
        file: File;
    }) => {
        setIsProcessing(true);

        try {
            setStatusText('Uploading the file...');
            const uploadedFile = await fs.upload([file]);
            if (!uploadedFile) throw new Error('Failed to upload file');

            setStatusText('Converting to image...');
            const imageFile = await convertPdfToImage(file);
            if (!imageFile.file) throw new Error('Failed to convert PDF to image');

            setStatusText('Uploading the image...');
            const uploadedImage = await fs.upload([imageFile.file]);
            if (!uploadedImage) throw new Error('Failed to upload image');

            setStatusText('Preparing data...');
            const uuid = generateUUID();
            const data = {
                id: uuid,
                resumePath: uploadedFile.path,
                imagePath: uploadedImage.path,
                companyName,
                jobTitle,
                jobDescription,
                feedback: '',
            };
            await kv.set(`resume:${uuid}`, JSON.stringify(data));

            setStatusText('Analyzing resume...');
            const feedback = await ai.feedback(
                uploadedFile.path,
                prepareInstructions({ jobTitle, jobDescription, AIResponseFormat })
            );
            if (!feedback) throw new Error('Failed to analyze resume');

            const feedbackText =
                typeof feedback.message.content === 'string'
                    ? feedback.message.content
                    : feedback.message.content[0].text;

            const cleanedText = feedbackText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();

            data.feedback = JSON.parse(cleanedText);
            await kv.set(`resume:${uuid}`, JSON.stringify(data));

            setStatusText('Analysis complete! Redirecting...');
            navigate(`/resume/${uuid}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Something went wrong';
            setStatusText(`Error: ${message}. Please try again.`);
            setIsProcessing(false);
        }
    };

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const formData = new FormData(e.currentTarget);
        const companyName = formData.get('company-name') as string;
        const jobTitle = formData.get('job-title') as string;
        const jobDescription = formData.get('job-description') as string;

        if (!file) {
            setStatusText('Please upload a resume.');
            return;
        }
        if (!companyName || !jobTitle) {
            setStatusText('Please fill in company name and job title.');
            return;
        }

        handleAnalyze({ companyName, jobTitle, jobDescription, file });
    };

    return (
        <main className="bg-[url('/images/bg-main.svg')] bg-cover">
            <Navbar />
            <section className="main-section">
                <div className="page-heading py-16">
                    <h1>Smart feedback for your dream job</h1>

                    {isProcessing ? (
                        <div className="flex flex-col items-center gap-4">
                            <h2>{statusText}</h2>
                            <img
                                src="/images/resume-scan.gif"
                                alt="Scanning resume..."
                                className="w-64 mx-auto"
                            />
                        </div>
                    ) : (
                        <>
                            <h2>Drop your resume for an ATS score and improvement tips</h2>

                            {statusText && (
                                <p className="text-red-500 text-sm mt-2">{statusText}</p>
                            )}

                            <form
                                id="upload-form"
                                onSubmit={handleSubmit}
                                className="flex flex-col gap-4 mt-8"
                            >
                                <div className="form-div">
                                    <label htmlFor="company-name">Company Name</label>
                                    <input
                                        type="text"
                                        name="company-name"
                                        placeholder="Company Name"
                                        id="company-name"
                                        required
                                    />
                                </div>
                                <div className="form-div">
                                    <label htmlFor="job-title">Job Title</label>
                                    <input
                                        type="text"
                                        name="job-title"
                                        placeholder="Job Title"
                                        id="job-title"
                                        required
                                    />
                                </div>
                                <div className="form-div">
                                    <label htmlFor="job-description">Job Description</label>
                                    <textarea
                                        rows={5}
                                        name="job-description"
                                        placeholder="Job Description (optional)"
                                        id="job-description"
                                    />
                                </div>
                                <div className="form-div">
                                    <label htmlFor="uploader">Upload Resume</label>
                                    <FileUploader onFileSelect={handleFileSelect} />
                                </div>
                                <button className="primary-button" type="submit">
                                    Analyze Resume
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </section>
        </main>
    );
};

export default Upload;