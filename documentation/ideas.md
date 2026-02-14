# Product Ideas & Roadmap

## Core Concept: Project-Based Research Workflow

### Project Structure
- **Project** = Top-level container for research work
  - **Library**: Collection of papers (with metadata, PDFs, notes)
  - **Code**: Implementations, experiments, benchmarks
  - **Alerts**: Research notifications for topics/authors

---

## Feature: Natural Language Project Creation

### Use Case 1: Quick Project Setup
**User:** "Pull up recent papers on 2026 programmable networks and add them to new project"

**System Actions:**
1. Search arXiv for papers matching query
2. Create new project with auto-generated name
3. Add papers to project library
4. Display project overview

**Result:** New project with populated library ready for exploration

---

## Feature: Code Deployment & Testing

### Use Case 2: Run Paper Implementation
**User:** "You have access to Modal, can you go and get their code up and running so I can test it?"

**System Actions:**
1. Identify GitHub/code repository from paper
2. Clone repository
3. Detect dependencies and environment requirements
4. Deploy to Modal (or other compute platform)
5. Provide testing interface/API endpoint
6. Return logs and results

**Technologies:**
- Modal for serverless compute
- Docker for containerization
- Automatic dependency detection (requirements.txt, environment.yml, etc.)

---

## Feature: Cross-Paper Experimentation

### Use Case 3: Compare Approaches
**User:** "Compare the approaches from Paper A and Paper B on the benchmark from Paper C"

**System Actions:**
1. Extract methodologies from Papers A & B
2. Identify/download benchmark dataset from Paper C
3. Set up testing environment
4. Run both implementations on benchmark
5. Generate comparison report with:
   - Performance metrics
   - Runtime analysis
   - Resource usage
   - Statistical significance tests

**Challenges:**
- Not all papers have runnable code
- Different frameworks/languages
- Reproducibility issues
- Compute resource requirements

**Solutions:**
- Paper compatibility scoring
- Auto-conversion between frameworks where possible
- Clear messaging when comparison isn't feasible
- Suggest alternative benchmarks

---

## Feature: Dataset Management

### Use Case 4: Install Relevant Datasets
**User:** "Install all datasets relevant to this paper"

**System Actions:**
1. Parse paper for dataset references
2. Identify dataset sources:
   - HuggingFace Datasets
   - Papers with Code
   - Kaggle
   - Academic repositories
   - Author-provided links
3. Download and cache datasets
4. Version control for reproducibility
5. Link datasets to project

**Data Storage:**
- Local cache for small datasets
- Cloud storage (S3/GCS) for large datasets
- Dataset registry/manifest per project

---

## Feature: Research Alerts & Discovery

### Use Case 5: Set Up Research Alerts
**User:** "Set up alerts for new papers on transformer architectures by Yann LeCun"

**Alert Types:**
1. **Topic-based alerts**
   - Keywords/phrases
   - Semantic similarity to reference papers
   - arXiv categories
   
2. **Author-based alerts**
   - Specific researchers
   - Research groups/institutions
   - Citation patterns

3. **Benchmark/dataset alerts**
   - New results on specific benchmarks
   - Dataset updates

**Notification System:**
- Daily/weekly digest emails
- In-app notifications
- Slack/Discord integration
- RSS feeds

**Alert Storage:**
- Alerts live inside projects
- Can be global or project-specific
- Alert history and matching papers

---

## Feature: Multi-Paper Analysis

### Use Case 6: Comprehensive Literature Review
**User:** "Summarize the evolution of attention mechanisms from 2017-2026"

**System Actions:**
1. Query papers across time range
2. Identify seminal papers and citations
3. Track methodology evolution
4. Generate timeline visualization
5. Highlight breakthrough moments
6. Compare performance trends

---

## Feature: Reproducibility Toolkit

### Components:
1. **Environment Snapshots**
   - Capture exact dependencies
   - Container images
   - Hardware specs

2. **Experiment Logging**
   - Hyperparameters
   - Training curves
   - Checkpoints
   - Random seeds

3. **Result Verification**
   - Re-run experiments
   - Statistical validation
   - Ablation studies

---

## Technical Architecture

### Project Data Model
```
Project {
  id: uuid
  name: string
  created_at: timestamp
  
  library: {
    papers: [
      {
        arxiv_id: string
        title: string
        authors: []
        abstract: string
        pdf_url: string
        code_url?: string
        datasets?: []
        tags: []
        notes: string
        added_at: timestamp
      }
    ]
  }
  
  code: {
    repositories: []
    experiments: []
    deployments: []
  }
  
  alerts: [
    {
      type: "topic" | "author" | "benchmark"
      query: string
      frequency: "daily" | "weekly"
      active: boolean
      matches: []
    }
  ]
  
  benchmarks: {
    datasets: []
    results: []
    comparisons: []
  }
}
```

### Agent Tools to Implement

1. **create_project(name, description)**
2. **add_papers_to_project(project_id, paper_ids[])**
3. **search_papers(query, filters)**
4. **deploy_code(repo_url, project_id)**
5. **run_experiment(code_id, dataset_id, config)**
6. **compare_approaches(paper_a_id, paper_b_id, benchmark_id)**
7. **install_dataset(dataset_name, project_id)**
8. **create_alert(type, query, frequency)**
9. **get_alert_matches(alert_id)**

### Storage Requirements

- PostgreSQL/Supabase for structured data (projects, papers, alerts)
- Object storage for PDFs, datasets, model checkpoints
- Elasticsearch for paper search
- Redis for caching and job queues

---

## Phase 1: MVP (Current + Near Term)

- [x] Paper search and discovery
- [x] Agent conversation interface
- [ ] Basic project creation
- [ ] Add papers to projects
- [ ] Project library view

## Phase 2: Code Integration

- [ ] Code repository detection
- [ ] Modal deployment integration
- [ ] Basic experiment runner
- [ ] Environment management

## Phase 3: Advanced Features

- [ ] Cross-paper comparison
- [ ] Dataset management
- [ ] Research alerts
- [ ] Multi-paper analysis

## Phase 4: Collaboration & Scale

- [ ] Shared projects
- [ ] Team workspaces
- [ ] API access
- [ ] Notebook integration (Jupyter, Colab)

---

## Open Questions

1. **How to handle papers without code?**
   - Offer to implement from paper description?
   - Suggest similar papers with code?
   - Community contributions?

2. **Compute resource limits?**
   - Free tier limits
   - Premium tiers for heavy compute
   - Bring-your-own-cloud options

3. **Reproducibility challenges?**
   - Not all experiments are reproducible
   - Missing implementation details
   - Deprecated dependencies
   - How to communicate limitations?

4. **Legal/ethical considerations?**
   - Copyright for papers/code
   - Dataset licensing
   - Model weights redistribution
   - Fair use policies

---

## Success Metrics

- Time to reproduce paper results
- Number of successful code deployments
- Alert precision/recall
- User engagement with projects
- Papers read → experiments run conversion rate
