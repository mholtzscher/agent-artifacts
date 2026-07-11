package api

import "github.com/danielgtaylor/huma/v2"

type publishForm struct {
	File        huma.FormFile `form:"file" contentType:"text/markdown,text/html,application/octet-stream" required:"true"`
	Title       string        `form:"title" required:"false"`
	Description string        `form:"description" required:"false"`
	Project     string        `form:"project" required:"false"`
	Repo        string        `form:"repo" required:"false"`
	Branch      string        `form:"branch" required:"false"`
	CommitSHA   string        `form:"commit_sha" required:"false"`
	Dirty       string        `form:"dirty" required:"false"`
	Agent       string        `form:"agent" required:"false"`
	Generator   string        `form:"generator" required:"false"`
}
type publishInput struct {
	WriteKey string `header:"X-Write-Key" required:"true" doc:"Shared publication secret"`
	RawBody  huma.MultipartFormFiles[publishForm]
}
