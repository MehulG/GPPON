import argparse
import os
import subprocess
import glob

def main():
    parser = argparse.ArgumentParser(description='Process videos using Docker and FFmpeg')
    parser.add_argument('--input', nargs='+', default=['*.mp4'], 
                        help='Input file patterns (default: *.mp4)')
    parser.add_argument('--resolution', default='1280x720', 
                        help='Output video resolution (default: 1280x720)')
    
    args = parser.parse_args()

    # Find input files
    input_files = []
    for pattern in args.input:
        input_files.extend(glob.glob(pattern))

    if not input_files:
        print("No input files found.")
        return

    # Create Dockerfile
    dockerfile_content = """
FROM jrottenberg/ffmpeg:latest
WORKDIR /app
COPY . /app/
ENTRYPOINT ["ffmpeg"]
"""
    
    with open("Dockerfile", "w") as f:
        f.write(dockerfile_content)

    # Build Docker image
    subprocess.run(["docker", "build", "-t", "ffmpeg_process", "."], check=True)

    # Process each input file individually
    for input_file in input_files:
        output_file = f"output_{os.path.basename(input_file)}"
        run_cmd = [
            "docker", "run", "--rm", 
            "-v", f"{os.getcwd()}:/output",
            "ffmpeg_process", 
            "-i", f"/app/{os.path.basename(input_file)}", 
            "-vf", f"scale={args.resolution}", 
            "-c:a", "copy", 
            f"/output/{output_file}"
        ]
    
        subprocess.run(run_cmd, check=True)

if __name__ == "__main__":
    main()